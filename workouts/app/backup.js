// Export en import van trainingen als JSON. Bedoeld om een training mee te nemen tussen apparaten en
// tussen de GitHub Pages-app en het artefact, die elk hun eigen opslag hebben.
import { listSessions, loadPlan, loadState, upsertSession } from "./store.js";

// Alle trainingen die op dit apparaat staan, bezig en klaar, met plan en voortgang.
export function exportLocal() {
  const trainingen = listSessions()
    .map((s) => {
      const plan = loadPlan(s.id);
      if (!plan) return null;
      return { id: s.id, title: s.title, date: s.date, status: s.status, startMs: s.startMs, plan, state: loadState(s.id) || {} };
    })
    .filter(Boolean);
  return { app: "ferro-fitness", versie: 1, trainingen };
}

export function downloadExport() {
  const n = listSessions().length;
  const blob = new Blob([JSON.stringify(exportLocal(), null, 2) + "\n"], { type: "application/json" });
  const day = new Date().toLocaleDateString("sv-SE");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ferro-trainingen-${day}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return n;
}

// Leest tekst uit een bestand. Accepteert het exportformaat, een lijst, en het losse formaat uit workouts/done/ ({ versie, plan, state }).
// Geeft alleen items terug die een plan met id en blokken hebben.
export function parseImport(text) {
  const data = JSON.parse(text);
  let list;
  if (Array.isArray(data)) list = data;
  else if (data && Array.isArray(data.trainingen)) list = data.trainingen;
  else list = [data];
  return list.filter((x) => x && x.plan && x.plan.id && Array.isArray(x.plan.blocks));
}

// Zet de trainingen op dit apparaat. Een training die hier al bestaat, blijft ongewijzigd.
export function importItems(items) {
  const have = new Set(listSessions().map((s) => s.id));
  let added = 0, skipped = 0;
  for (const it of items) {
    const plan = it.plan;
    if (have.has(plan.id)) { skipped++; continue; }
    const state = it.state && typeof it.state === "object" ? it.state : {};
    const status = it.status === "bezig" ? "bezig" : "klaar";
    try {
      localStorage.setItem(`fw-plan-${plan.id}`, JSON.stringify(plan));
      localStorage.setItem(`fw-${plan.id}`, JSON.stringify(state));
    } catch (e) {
      throw new Error("opslag");
    }
    upsertSession({ id: plan.id, title: plan.title, date: plan.date, startMs: it.startMs || state.startMs || Date.now(), status });
    have.add(plan.id);
    added++;
  }
  return { added, skipped };
}
