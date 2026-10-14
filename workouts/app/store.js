// Opslag van trainingen. Alles in localStorage, pas na het starten van een training.
// fw-sessions: lijst van { id, title, date, startMs, status: "bezig" | "klaar" }
// fw-plan-<id>: het plan van die training. fw-<id>: de voortgang (afvinkingen, gewichten, pauzes).

const LIST = "fw-sessions";

export function listSessions() {
  try { return JSON.parse(localStorage.getItem(LIST)) || []; } catch (e) { return []; }
}

function writeList(list) {
  try { localStorage.setItem(LIST, JSON.stringify(list)); } catch (e) {}
}

export function upsertSession(s) {
  const rest = listSessions().filter((x) => x.id !== s.id);
  writeList([{ ...s }, ...rest]);
}

export function setStatus(id, status) {
  const list = listSessions();
  const x = list.find((y) => y.id === id);
  if (x && x.status !== status) {
    x.status = status;
    writeList(list);
  }
}

export function savePlan(plan) {
  try { localStorage.setItem(`fw-plan-${plan.id}`, JSON.stringify(plan)); } catch (e) {}
}

export function loadPlan(id) {
  try { return JSON.parse(localStorage.getItem(`fw-plan-${id}`)); } catch (e) { return null; }
}

// Verwijdert de training volledig: lijst, plan en voortgang.
export function removeSession(id) {
  writeList(listSessions().filter((x) => x.id !== id));
  for (const k of [`fw-${id}`, `fw-plan-${id}`]) {
    try { localStorage.removeItem(k); } catch (e) {}
  }
}
