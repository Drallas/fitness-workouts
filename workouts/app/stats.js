// Gegevens over alle trainingen: lokaal (op dit apparaat) en afgerond in de repo (workouts/done/).
// Hieruit komen de geschiedenis en de persoonlijke records.
import { listSessions, loadPlan, loadState } from "./store.js";

export function loadProfile() {
  try { return JSON.parse(localStorage.getItem("fw-profile")) || {}; } catch (e) { return {}; }
}
export function saveProfile(p) {
  try { localStorage.setItem("fw-profile", JSON.stringify(p)); } catch (e) {}
}

// Alle trainingen die je kunt bekijken. Elk item: { id, title, date, status, plan, state, source, link }.
export async function allRecords() {
  const out = [];
  for (const s of listSessions()) {
    const plan = loadPlan(s.id);
    if (!plan) continue;
    out.push({
      id: s.id, title: s.title, date: s.date, status: s.status, plan,
      state: loadState(s.id) || {}, source: "lokaal", link: `train.html?id=${encodeURIComponent(s.id)}`,
    });
  }
  try {
    const index = await (await fetch(new URL("../done/index.json", import.meta.url))).json();
    for (const item of index) {
      try {
        const rec = await (await fetch(new URL("../done/" + item.file, import.meta.url))).json();
        out.push({
          id: rec.plan.id, title: rec.plan.title, date: rec.plan.date, status: "klaar",
          plan: rec.plan, state: rec.state || {}, source: "GitHub", link: `train.html?file=../done/${encodeURIComponent(item.file)}`,
        });
      } catch (e) {}
    }
  } catch (e) {}
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
