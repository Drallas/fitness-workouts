import { buildFit, buildWorkoutFit } from "./fit.js";
import { savePlan, loadPlan, upsertSession, setStatus } from "./store.js";
import { renderShare, SHARE_FORMATS } from "./share.js";

// Pas geladen bij het exporteren, zodat de sets ook renderen als de CDN niet bereikbaar is.
const SDK_URL = "https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.217.0/src/index.js";
let sdkPromise = null;
const loadSdk = () => (sdkPromise ??= import(SDK_URL));

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const fmtSec = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const fmtNum = (n) => String(n).replace(".", ",");

let READONLY = false; // afgeronde training uit een bestand: alleen bekijken en exporteren
let W; // workout JSON
let KEY;
let state = { startMs: null, vals: {}, done: {}, pauses: [] };
const setIndex = {}; // setId -> { ex, set, i }

// Pas bewaren als de training gestart is. Daarvoor blijft alles in het geheugen van de pagina.
function save() {
  if (READONLY) return;
  try {
    if (state.startMs) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch (e) {}
}

// Dumbbell-oefeningen: het ingevoerde gewicht is per hand, het totaal is dat maal twee.
const factorOf = (ex) => (ex.dumbbell ? 2 : 1);

// Pauzes: elk interval is [van, tot] in echte tijd. tot is null zolang de pauze loopt.
function isPaused() {
  const p = (state.pauses || []).at(-1);
  return !!p && p[1] == null;
}
function pausedUntil(t) {
  let sum = 0;
  for (const [from, to] of state.pauses || []) {
    if (t > from) sum += Math.min(to ?? Infinity, t) - from;
  }
  return sum;
}
// Tijd zonder pauzes: wat er in het FIT-bestand komt, zodat de duur klopt met de werkelijke trainingstijd.
const adj = (t) => t - pausedUntil(t);

// Starttijd: expliciet gedrukt, anders 60 s voor de eerste afvinking.
function sessionStart() {
  if (state.startMs) return state.startMs;
  const times = Object.values(state.done);
  return times.length ? Math.min(...times) - 60000 : null;
}

function valueOf(id, set, ex) {
  const v = state.vals[id] || {};
  const wRaw = v.w !== undefined && v.w !== "" ? v.w : set.weight;
  const rRaw = v.r !== undefined ? v.r : set.reps;
  const w = parseFloat(String(wRaw).replace(",", "."));
  const r = rRaw === "" || rRaw === null || rRaw === undefined ? null : parseInt(rRaw, 10);
  const perHand = isNaN(w) ? 0 : w;
  return { perHand, total: perHand * factorOf(ex), reps: isNaN(r) ? null : r };
}

function completedSets() {
  return Object.entries(state.done)
    .sort((a, b) => a[1] - b[1])
    .map(([id, doneAt]) => {
      const { ex, set } = setIndex[id];
      const { perHand, total, reps } = valueOf(id, set, ex);
      return { id, exercise: ex.name, block: setIndex[id].block, category: ex.category, subtype: ex.subtype, label: set.label, perHand, weight: total, reps, dumbbell: !!ex.dumbbell, doneAt };
    });
}

function summary() {
  const done = completedSets();
  const start = sessionStart();
  const last = done.length ? done[done.length - 1].doneAt : start;
  const volume = done.reduce((sum, s) => sum + (s.reps ? s.weight * s.reps : 0), 0);
  const best = new Map();
  for (const s of done) {
    const prev = best.get(s.exercise);
    const score = s.weight * 1000 + (s.reps || 0);
    if (!prev || score > prev.score) best.set(s.exercise, { score, s });
  }
  const top = [...best.values()].map(({ s }) => {
    let text = "";
    if (s.dumbbell && s.perHand) text = `2 × ${fmtNum(s.perHand)} kg × ${s.reps ?? "–"}`;
    else if (s.weight) text = `${fmtNum(s.weight)} kg × ${s.reps ?? "–"}`;
    else text = `${s.reps ?? "–"}`;
    return { name: s.exercise, text };
  });
  // aantal afgevinkte sets per blok, in de volgorde van het plan
  const blocks = W.blocks
    .map((b) => ({ title: b.title, sets: done.filter((s) => s.block === b.title).length }))
    .filter((b) => b.sets > 0);
  return {
    title: W.title,
    dateLabel: new Date(W.date + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    startLabel: start ? fmtTime(start) : "",
    sets: done.length,
    volume,
    minutes: start && last ? (adj(last) - adj(start)) / 60000 : 0,
    blocks,
    top,
  };
}

function render() {
  let html = "";
  let total = 0;
  for (const b of W.blocks) {
    html += `<section><div class="sechead">${b.tag ? `<span class="tag">${esc(b.tag)}</span>` : ""}<h2>${esc(b.title)}</h2></div>`;
    for (const ex of b.exercises) {
      const nameHtml = ex.demo ? `<a href="${esc(ex.demo)}" target="_blank" rel="noopener">${esc(ex.name)}</a>` : esc(ex.name);
      // Plaatje van de oefening; zonder plaatje een vak met een YouTube-zoeklink.
      const link = ex.demo || "https://www.youtube.com/results?search_query=" + encodeURIComponent(ex.name + " techniek");
      const thumb = ex.img
        ? `<a class="thumb" href="${esc(link)}" target="_blank" rel="noopener"><img src="${esc(ex.img)}" alt="${esc(ex.name)}" loading="lazy"><span class="ov">Uitleg ↗</span></a>`
        : `<a class="thumb ph" href="${esc(link)}" target="_blank" rel="noopener"><span class="ov">▶ Zoek op YouTube</span></a>`;
      html += `<div class="ex"><div class="exhead">${thumb}<div class="exname">${nameHtml}</div></div>
        <div class="facts"><span>${ex.sets.length} sets</span><span>${ex.category}${ex.subtype ? " · " + esc(ex.subtype) : ""}</span>${ex.dumbbell ? "<span>per dumbbell</span>" : ""}${ex.rest ? `<span class="rest">rust ${fmtSec(ex.rest)}</span>` : ""}${ex.demo ? `<a href="${esc(ex.demo)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600;font-family:var(--font-body)">uitleg bekijken ↗</a>` : ""}</div>
        <div class="sets">`;
      ex.sets.forEach((set, i) => {
        const id = `${ex.id}-${i}`;
        setIndex[id] = { ex, set, i, block: b.title };
        total++;
        const v = state.vals[id] || {};
        const w = v.w !== undefined ? v.w : set.weight;
        const r = v.r !== undefined ? v.r : set.reps ?? "";
        const isDone = !!state.done[id];
        html += `<div class="set${isDone ? " done" : ""}" data-id="${id}" data-rest="${ex.rest}" data-name="${esc(ex.name)}">
          <input type="checkbox" id="c-${id}" aria-label="${esc(ex.name + " " + set.label)} afvinken" ${isDone ? "checked" : ""}>
          <label class="lbl" for="c-${id}">${esc(set.label)}</label>
          <div class="fld r"><input type="text" inputmode="numeric" id="r-${id}" aria-label="Herhalingen" value="${esc(r)}"><span class="unit">reps</span></div>
          <div class="fld w">${ex.dumbbell ? '<span class="pre">2 ×</span>' : ""}<input type="text" inputmode="decimal" id="w-${id}" aria-label="${ex.dumbbell ? "Gewicht per dumbbell in kg" : "Gewicht in kg"}" value="${esc(w)}"><span class="unit">kg</span></div>
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `</section>`;
  }
  $("sections").innerHTML = html;
  // Lukt een plaatje niet, dan toont het vak de YouTube-zoeklink.
  document.querySelectorAll(".thumb img").forEach((img) => img.addEventListener("error", () => {
    const a = img.parentNode;
    a.classList.add("ph");
    a.innerHTML = '<span class="ov">▶ Zoek op YouTube</span>';
  }));
  $("total").dataset.total = total;
  updateProgress();
}

function updateProgress() {
  const total = Number($("total").dataset.total || 0);
  const done = Object.keys(state.done).length;
  $("pc").textContent = `${done} / ${total} sets`;
  const p = total ? Math.round((done / total) * 100) : 0;
  $("pp").textContent = `${p}%`;
  $("barfill").style.width = `${p}%`;
  let info = state.startMs ? `Gestart om ${fmtTime(state.startMs)}` : sessionStart() ? `Starttijd schatting ${fmtTime(sessionStart())}` : "Nog niet gestart";
  if (isPaused()) info += " · gepauzeerd";
  $("startinfo").textContent = info;
  if (state.startMs && !READONLY) setStatus(W.id, done === total && total ? "klaar" : "bezig");
  // Export is er altijd, ook voor je de eerste set hebt afgevinkt.
  $("exportrow").hidden = false;
  $("startbtn").hidden = !!state.startMs;
  $("pausebtn").hidden = !state.startMs || READONLY;
  $("pausebtn").textContent = isPaused() ? "Hervat training" : "Pauze";
  $("pausebtn").setAttribute("aria-pressed", String(isPaused()));
}

function togglePause() {
  const now = Date.now();
  if (isPaused()) {
    state.pauses.at(-1)[1] = now;
    if (restLeft !== null) {
      endAt = now + restLeft;
      restLeft = null;
      $("timer").hidden = false;
      tmr = setInterval(tick, 250);
      tick();
    }
  } else {
    state.pauses.push([now, null]);
    if (tmr) {
      restLeft = Math.max(0, endAt - now);
      clearInterval(tmr);
      tmr = null;
      $("tl").textContent = "Gepauzeerd";
      $("tt").textContent = fmtSec(Math.ceil(restLeft / 1000));
    }
  }
  save();
  updateProgress();
}

// Rusttimer
let tmr = null;
let endAt = 0;
let restLeft = null; // resterende rust (ms) terwijl gepauzeerd
function startRest(sec, name) {
  stopRest();
  if (!sec) return;
  endAt = Date.now() + sec * 1000;
  restLeft = null;
  $("timer").hidden = false;
  $("timer").classList.remove("end");
  $("tl").textContent = `Rust na ${name}`;
  tick();
  tmr = setInterval(tick, 250);
}
function tick() {
  const left = Math.ceil((endAt - Date.now()) / 1000);
  if (left <= 0) {
    clearInterval(tmr);
    tmr = null;
    $("tt").textContent = "0:00";
    $("tl").textContent = "Volgende set";
    $("timer").classList.add("end");
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
    return;
  }
  $("tt").textContent = fmtSec(left);
}
function stopRest() {
  if (tmr) clearInterval(tmr);
  tmr = null;
  restLeft = null;
  $("timer").hidden = true;
}

// Events
$("sections").addEventListener("change", (e) => {
  if (e.target.type !== "checkbox") return;
  const row = e.target.closest(".set");
  const id = row.dataset.id;
  if (e.target.checked) {
    if (isPaused()) togglePause(); // afvinken is werken: pauze stopt automatisch
    state.done[id] = Date.now();
    rememberWeight(setIndex[id].ex, id, setIndex[id].set);
    row.classList.add("done");
    startRest(Number(row.dataset.rest), row.dataset.name);
  } else {
    delete state.done[id];
    row.classList.remove("done");
  }
  save();
  updateProgress();
});

$("sections").addEventListener("input", (e) => {
  if (e.target.type !== "text") return;
  const row = e.target.closest(".set");
  const id = row.dataset.id;
  const v = state.vals[id] || {};
  if (e.target.id.startsWith("w-")) v.w = e.target.value;
  else v.r = e.target.value;
  state.vals[id] = v;
  save();
});

$("startbtn").addEventListener("click", () => {
  state.startMs = Date.now();
  // Vanaf nu staat de training in de lijst op de startpagina, tot je hem verwijdert.
  savePlan(W);
  upsertSession({ id: W.id, title: W.title, date: W.date, startMs: state.startMs, status: "bezig" });
  save();
  updateProgress();
});

$("pausebtn").addEventListener("click", togglePause);
$("tskip").addEventListener("click", stopRest);

let armed = false;
$("reset").addEventListener("click", () => {
  const rb = $("reset");
  if (!armed) {
    armed = true;
    rb.textContent = "Tik nogmaals om alles te wissen";
    setTimeout(() => { armed = false; rb.textContent = "Wis ingevulde waarden"; }, 4000);
    return;
  }
  state = { startMs: null, vals: {}, done: {}, pauses: [] };
  save();
  armed = false;
  rb.textContent = "Wis ingevulde waarden";
  stopRest();
  render();
});

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Geplande workout voor Garmin: elke set als stap, met rust ertussen (niet na de laatste set).
// Gewichten en reps komen uit je laatste aanpassingen, anders uit het plan. Gewicht is het totaal.
function plannedSteps() {
  const flat = [];
  for (const b of W.blocks) for (const ex of b.exercises) ex.sets.forEach((set, i) => flat.push({ ex, set, i }));
  const steps = [];
  flat.forEach(({ ex, set, i }, n) => {
    const { total, reps } = valueOf(`${ex.id}-${i}`, set, ex);
    steps.push({
      name: `${ex.name} · ${set.label}`,
      category: ex.category,
      subtype: ex.subtype,
      reps,
      weight: total,
    });
    if (ex.rest && n < flat.length - 1) steps.push({ rest: true, restSec: ex.rest });
  });
  return steps;
}

$("wodbtn").addEventListener("click", async () => {
  try {
    const sdk = await loadSdk();
    const bytes = buildWorkoutFit(sdk, { title: W.title, steps: plannedSteps() });
    download(new Blob([bytes], { type: "application/vnd.ant.fit" }), `${W.id}-workout.fit`);
    $("msg").textContent = "Workout-bestand gemaakt. Bij Garmin Connect komt dit onder Trainingen, niet als activiteit.";
  } catch (e) {
    $("msg").textContent = "Workout-bestand lukte niet: de FIT-bibliotheek laadt niet. Controleer je verbinding en probeer opnieuw.";
  }
});

$("fitbtn").addEventListener("click", async () => {
  try {
    const sdk = await loadSdk();
    const done = completedSets().map((s) => ({ ...s, doneAt: adj(s.doneAt) }));
    const start = sessionStart();
    const bytes = buildFit(sdk, { sessionStartMs: start ? adj(start) : null, sets: done, title: W.title });
    download(new Blob([bytes], { type: "application/vnd.ant.fit" }), `${W.id}.fit`);
    $("msg").textContent = "FIT-bestand gemaakt. Upload het bij Garmin Connect (Activiteiten → Importeren) of direct bij Strava.";
  } catch (e) {
    $("msg").textContent = "FIT-bestand lukte niet: de FIT-bibliotheek laadt niet. Controleer je verbinding en probeer opnieuw.";
  }
});

// Afronden: de training krijgt de status afgerond en je downloadt een bestand met plan en resultaten.
// Dat bestand zet Claude in de repo (workouts/done/), waarna de training op GitHub staat.
$("finishbtn").addEventListener("click", () => {
  if (!state.startMs) { $("msg").textContent = "Start de training eerst."; return; }
  const rec = { versie: 1, plan: W, state, afgerond: new Date().toISOString() };
  download(new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" }), `${W.id}.json`);
  setStatus(W.id, "klaar");
  $("msg").textContent = "Training afgerond en in de lijst gezet. Stuur het gedownloade bestand naar Claude; dan komt de training op GitHub.";
});

document.querySelectorAll("[data-share]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.dataset.share;
    const blob = await renderShare(kind, summary());
    const name = `${W.id}-${kind}.png`;
    const file = new File([blob], name, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: W.title });
        return;
      }
    } catch (e) { /* gedeeld of geannuleerd: dan niet downloaden */ return; }
    download(blob, name);
    $("msg").textContent = `Plaatje voor ${SHARE_FORMATS[kind].label} gemaakt (${SHARE_FORMATS[kind].w}×${SHARE_FORMATS[kind].h}).`;
  });
});

// Gewichtsgeschiedenis per oefening (subtype → laatst gebruikt gewicht, per hand bij dumbbell).
// De startpagina gebruikt die om het startgewicht van een nieuwe workout in te vullen.
const HIST_KEY = "fw-hist";
function loadHist() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; } catch (e) { return {}; }
}
function rememberWeight(ex, id, set) {
  if (!ex.subtype || !state.startMs) return; // niets bewaren vóór de start
  const { perHand } = valueOf(id, set, ex);
  const h = loadHist();
  h[ex.subtype] = perHand;
  try { localStorage.setItem(HIST_KEY, JSON.stringify(h)); } catch (e) {}
}

// Oefeningen zonder demo-link (pushdag) krijgen dezelfde zoekopdracht als gegenereerde workouts.
function addDemoLinks(w) {
  for (const b of w.blocks) for (const ex of b.exercises) {
    if (!ex.demo) ex.demo = "https://www.youtube.com/results?search_query=" + encodeURIComponent(ex.name + " techniek");
  }
}

// Start: een gegenereerde workout uit de startpagina, tenzij ?w=push, dan de pushdag als voorbeeld.
(async function init() {
  const params = new URLSearchParams(location.search);
  let loaded = null;
  if (params.get("file")) {
    // Afgeronde training uit de repo (workouts/done/): plan en resultaat, alleen bekijken.
    try {
      const rec = await (await fetch(new URL(params.get("file"), location.href))).json();
      loaded = rec.plan;
      state = { ...state, ...rec.state };
      READONLY = true;
    } catch (e) {}
  } else if (params.get("id")) {
    // Een eerder gestarte training: het plan en de voortgang komen uit de opslag.
    loaded = loadPlan(params.get("id"));
  } else if (params.get("w") !== "push") {
    // Nieuw plan van de startpagina (deze tab).
    try { loaded = JSON.parse(sessionStorage.getItem("fw-current")); } catch (e) {}
  }
  W = loaded || await (await fetch(new URL("./workouts/push-2026-10-13.json", import.meta.url))).json();
  addDemoLinks(W);
  KEY = `fw-${W.id}`;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && !READONLY) state = { ...state, ...JSON.parse(raw) };
  } catch (e) {}
  if (state.startMs && !READONLY) upsertSession({ id: W.id, title: W.title, date: W.date, startMs: state.startMs, status: "bezig" });
  document.title = W.title;
  $("wtitle").textContent = W.title;
  $("wdate").textContent = new Date(W.date + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("rule").hidden = !W.id.startsWith("push");
  if (READONLY) {
    $("reset").hidden = true;
    $("startbtn").hidden = true;
    $("pausebtn").hidden = true;
    $("finishbtn").hidden = true;
  }
  if (W.notes?.length) {
    $("notes").innerHTML = W.notes.map((n) => `<p>${esc(n)}</p>`).join("");
    $("notes").hidden = false;
  }
  render();
})();
