// Gegevens over alle trainingen: lokaal (op dit apparaat) en afgerond in de repo (workouts/done/).
// Hieruit komen de geschiedenis en de persoonlijke records.
import { listSessions, loadPlan, loadState } from "./store.js";

export function loadProfile() {
  try { return JSON.parse(localStorage.getItem("fw-profile")) || {}; } catch (e) { return {}; }
}
// Geeft false terug als het opslaan mislukt (bv. geen opslagruimte of geblokkeerde opslag), zodat de pagina dat kan melden.
export function saveProfile(p) {
  try { localStorage.setItem("fw-profile", JSON.stringify(p)); return true; } catch (e) { return false; }
}

// Alle trainingen die je kunt bekijken. Elk item: { id, title, date, status, plan, state, source, link }.
export async function allRecords() {
  const out = [];
  const seen = new Set();
  for (const s of listSessions()) {
    const plan = loadPlan(s.id);
    if (!plan) continue;
    seen.add(s.id);
    out.push({
      id: s.id, title: s.title, date: s.date, status: s.status, plan,
      state: loadState(s.id) || {}, source: "lokaal", link: `train.html?id=${encodeURIComponent(s.id)}`,
    });
  }
  // Vangnet: een gestarte training waarvan de lijst-invoer is kwijtgeraakt, komt toch terug onder Actief.
  // Een verwijderde training heeft geen plan meer (zie removeSession), dus die komt niet terug.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("fw-plan-")) continue;
      const id = key.slice("fw-plan-".length);
      if (seen.has(id)) continue;
      const plan = loadPlan(id);
      const state = loadState(id) || {};
      if (!plan || !state.startMs) continue; // ongestarte plannen tellen niet mee
      const total = plan.blocks.reduce((n, b) => n + b.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
      const doneAll = total > 0 && Object.keys(state.done || {}).length >= total;
      out.push({
        id, title: plan.title, date: plan.date, status: doneAll ? "klaar" : "bezig", plan,
        state, source: "lokaal", link: `train.html?id=${encodeURIComponent(id)}`,
      });
    }
  } catch (e) {}
  // Afgeronde trainingen: in de repo staat de map workouts/done/ naast workouts/app/ (../done/).
  // In een artefact staat die map naast de pagina (done/). Het eerste pad dat werkt, wint.
  const bases = ["../done/", "done/"];
  let base = null, index = null;
  for (const b of bases) {
    try {
      const r = await fetch(new URL(b + "index.json", import.meta.url));
      if (r.ok) { index = await r.json(); base = b; break; }
    } catch (e) {}
  }
  if (index) {
    for (const item of index) {
      try {
        const rec = await (await fetch(new URL(base + item.file, import.meta.url))).json();
        out.push({
          id: rec.plan.id, title: rec.plan.title, date: rec.plan.date, status: "klaar",
          plan: rec.plan, state: rec.state || {}, source: "GitHub", link: `train.html?file=${base}${encodeURIComponent(item.file)}`,
        });
      } catch (e) {}
    }
  }
  return out;
}

// Alle afgevinkte sets, per oefening. Sleutel: subtype (of naam als er geen subtype is).
export function collectSets(records) {
  const sets = [];
  for (const rec of records) {
    const done = rec.state.done || {};
    const vals = rec.state.vals || {};
    for (const b of rec.plan.blocks) for (const ex of b.exercises) {
      ex.sets.forEach((set, i) => {
        const id = `${ex.id}-${i}`;
        if (!done[id]) return;
        const v = vals[id] || {};
        const wRaw = v.w !== undefined && v.w !== "" ? v.w : set.weight;
        const rRaw = v.r !== undefined && v.r !== "" ? v.r : set.reps;
        const perHand = parseFloat(String(wRaw ?? 0).replace(",", ".")) || 0;
        const reps = parseInt(rRaw, 10);
        const factor = ex.dumbbell ? 2 : 1;
        sets.push({
          key: ex.subtype || ex.name, name: ex.name, dumbbell: !!ex.dumbbell,
          perHand, total: perHand * factor, reps: isNaN(reps) ? null : reps,
          date: rec.date, title: rec.title, link: rec.link,
        });
      });
    }
  }
  return sets;
}

// Per oefening: gemiddelde, persoonlijk record, geschatte 1RM (Epley: gewicht × (1 + reps / 30)) en de laatste set.
export function buildHistory(records) {
  const sets = collectSets(records);
  const byKey = new Map();
  for (const s of sets) {
    if (!byKey.has(s.key)) byKey.set(s.key, { name: s.name, dumbbell: s.dumbbell, sets: [] });
    byKey.get(s.key).sets.push(s);
  }
  const rows = [];
  for (const [key, g] of byKey) {
    const weighted = g.sets.filter((s) => s.total > 0);
    const avg = weighted.length ? weighted.reduce((n, s) => n + s.total, 0) / weighted.length : null;
    const pr = weighted.reduce((best, s) => (!best || s.total > best.total || (s.total === best.total && (s.reps || 0) > (best.reps || 0)) ? s : best), null);
    const e1 = g.sets.filter((s) => s.total > 0 && s.reps).reduce((best, s) => {
      const v = s.total * (1 + s.reps / 30);
      return !best || v > best.v ? { v, s } : best;
    }, null);
    const last = [...g.sets].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    rows.push({
      key, name: g.name, dumbbell: g.dumbbell, count: g.sets.length,
      sessions: new Set(g.sets.map((s) => s.title + s.date)).size,
      avg, pr, e1rm: e1 ? e1.v : null, last,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

export function fmtKg(total, dumbbell, perHand) {
  const n = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
  return dumbbell ? `2 × ${n(perHand)} kg` : `${n(total)} kg`;
}
