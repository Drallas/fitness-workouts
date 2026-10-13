import { buildFit, buildWorkoutFit } from "./fit.js";

// Pas geladen bij het exporteren, zodat de sets ook renderen als de CDN niet bereikbaar is.
const SDK_URL = "https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.217.0/src/index.js";
let sdkPromise = null;
const loadSdk = () => (sdkPromise ??= import(SDK_URL));
import { renderShare, SHARE_FORMATS } from "./share.js";

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const fmtSec = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

let W; // workout JSON
let KEY;
let state = { startMs: null, vals: {}, done: {} };
const setIndex = {}; // setId -> { ex, set, i }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

// Starttijd: expliciet gedrukt, anders 60 s voor de eerste afvinking.
function sessionStart() {
  if (state.startMs) return state.startMs;
  const times = Object.values(state.done);
  return times.length ? Math.min(...times) - 60000 : null;
}

function completedSets() {
  return Object.entries(state.done)
    .sort((a, b) => a[1] - b[1])
    .map(([id, doneAt]) => {
      const { ex, set } = setIndex[id];
      const v = state.vals[id] || {};
      const w = v.w !== undefined && v.w !== "" ? parseFloat(String(v.w).replace(",", ".")) : set.weight;
      const rRaw = v.r !== undefined ? v.r : set.reps;
      const r = rRaw === "" || rRaw === null || rRaw === undefined ? null : parseInt(rRaw, 10);
      return { id, exercise: ex.name, category: ex.category, subtype: ex.subtype, label: set.label, weight: isNaN(w) ? 0 : w, reps: isNaN(r) ? null : r, doneAt };
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
  const top = [...best.values()].map(({ s }) => ({
    name: s.exercise,
    text: `${s.weight ? s.weight.toString().replace(".", ",") + " kg × " : ""}${s.reps ?? "–"}`,
  }));
  return {
    title: W.title,
    dateLabel: new Date(W.date + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    startLabel: start ? fmtTime(start) : "",
    sets: done.length,
    volume,
    minutes: start && last ? (last - start) / 60000 : 0,
    top,
  };
}

function render() {
  let html = "";
  let total = 0;
  for (const b of W.blocks) {
    html += `<section><div class="sechead">${b.tag ? `<span class="tag">${esc(b.tag)}</span>` : ""}<h2>${esc(b.title)}</h2></div>`;
    for (const ex of b.exercises) {
      html += `<div class="ex"><div class="exname">${esc(ex.name)}</div>
        <div class="facts"><span>${ex.sets.length} sets</span><span>${ex.category}${ex.subtype ? " · " + esc(ex.subtype) : ""}</span>${ex.rest ? `<span class="rest">rust ${fmtSec(ex.rest)}</span>` : ""}</div>
        <div class="sets">`;
      ex.sets.forEach((set, i) => {
        const id = `${ex.id}-${i}`;
        setIndex[id] = { ex, set, i };
        total++;
        const v = state.vals[id] || {};
        const w = v.w !== undefined ? v.w : set.weight;
        const r = v.r !== undefined ? v.r : set.reps ?? "";
        const isDone = !!state.done[id];
        html += `<div class="set${isDone ? " done" : ""}" data-id="${id}" data-rest="${ex.rest}" data-name="${esc(ex.name)}">
          <input type="checkbox" id="c-${id}" aria-label="${esc(ex.name + " " + set.label)} afvinken" ${isDone ? "checked" : ""}>
          <label class="lbl" for="c-${id}">${esc(set.label)}</label>
          <input type="text" inputmode="decimal" id="w-${id}" aria-label="Gewicht in kg" value="${esc(w)}">
          <span class="x">×</span>
          <input type="text" inputmode="numeric" id="r-${id}" aria-label="Herhalingen" value="${esc(r)}"></div>`;
      });
      html += `</div></div>`;
    }
    html += `</section>`;
  }
  $("sections").innerHTML = html;
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
  const startTxt = state.startMs ? `Gestart om ${fmtTime(state.startMs)}` : sessionStart() ? `Starttijd schatting ${fmtTime(sessionStart())}` : "Nog niet gestart";
  $("startinfo").textContent = startTxt;
  $("startbtn").hidden = !!state.startMs;
  $("exportrow").hidden = done === 0;
}

// Rusttimer
let tmr = null;
let endAt = 0;
function startRest(sec, name) {
  stopRest();
  if (!sec) return;
  endAt = Date.now() + sec * 1000;
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
  $("timer").hidden = true;
}

// Events
$("sections").addEventListener("change", (e) => {
  if (e.target.type !== "checkbox") return;
  const row = e.target.closest(".set");
  const id = row.dataset.id;
  if (e.target.checked) {
    state.done[id] = Date.now();
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
  save();
  updateProgress();
});

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
  state = { startMs: null, vals: {}, done: {} };
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
// Gewichten en reps komen uit je laatste aanpassingen, anders uit het plan.
function plannedSteps() {
  const flat = [];
  for (const b of W.blocks) for (const ex of b.exercises) ex.sets.forEach((set, i) => flat.push({ ex, set, i }));
  const steps = [];
  flat.forEach(({ ex, set, i }, n) => {
    const id = `${ex.id}-${i}`;
    const v = state.vals[id] || {};
    const w = v.w !== undefined && v.w !== "" ? parseFloat(String(v.w).replace(",", ".")) : set.weight;
    const rRaw = v.r !== undefined ? v.r : set.reps;
    const r = rRaw === "" || rRaw === null || rRaw === undefined ? null : parseInt(rRaw, 10);
    steps.push({
      name: `${ex.name} · ${set.label}`,
      category: ex.category,
      subtype: ex.subtype,
      reps: isNaN(r) ? null : r,
      weight: isNaN(w) ? 0 : w,
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
    const done = completedSets();
    const bytes = buildFit(sdk, { sessionStartMs: sessionStart(), sets: done, title: W.title });
    download(new Blob([bytes], { type: "application/vnd.ant.fit" }), `${W.id}.fit`);
    $("msg").textContent = "FIT-bestand gemaakt. Upload het bij Garmin Connect (Activiteiten → Importeren) of direct bij Strava.";
  } catch (e) {
    $("msg").textContent = "FIT-bestand lukte niet: de FIT-bibliotheek laadt niet. Controleer je verbinding en probeer opnieuw.";
  }
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

// Start
(async function init() {
  const url = new URL("./workouts/push-2026-10-13.json", import.meta.url);
  W = await (await fetch(url)).json();
  KEY = `fw-${W.id}`;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch (e) {}
  document.title = W.title;
  $("wtitle").textContent = W.title;
  $("wdate").textContent = new Date(W.date + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  render();
})();
