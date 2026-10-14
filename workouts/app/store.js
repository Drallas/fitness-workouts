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

// Voortgang van een training (afvinkingen, gewichten, pauzes), of null.
export function loadState(id) {
  try { return JSON.parse(localStorage.getItem(`fw-${id}`)) || null; } catch (e) { return null; }
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

// Prullenbak (fw-trash): verwijderde trainingen met hun plan en voortgang, tot je ze definitief wist.
// Een training in de prullenbak telt niet mee in de lijsten en in de geschiedenis.
const TRASH = "fw-trash";

export function listTrash() {
  try { return JSON.parse(localStorage.getItem(TRASH)) || []; } catch (e) { return []; }
}

function writeTrash(list) {
  try { localStorage.setItem(TRASH, JSON.stringify(list)); } catch (e) {}
}

// Verplaatst de training naar de prullenbak en haalt hem uit de lijst.
export function trashSession(id) {
  const plan = loadPlan(id);
  const st = loadState(id) || {};
  // Ook als de lijst-invoer al kwijt is: het plan bepaalt of de training bestaat.
  const s = listSessions().find((x) => x.id === id)
    || (plan ? { id, title: plan.title, date: plan.date, startMs: st.startMs, status: "bezig" } : null);
  if (!s) return;
  const trash = listTrash().filter((x) => x.id !== id);
  trash.unshift({ ...s, plan, state: st, deletedAt: new Date().toISOString() });
  writeTrash(trash);
  removeSession(id);
}

// Herstelt een training uit de prullenbak: terug in de lijst, met plan en voortgang.
export function restoreTrash(id) {
  const item = listTrash().find((x) => x.id === id);
  if (!item) return;
  purgeTrash(id);
  try { localStorage.setItem(`fw-plan-${id}`, JSON.stringify(item.plan)); } catch (e) {}
  if (item.state && Object.keys(item.state).length) {
    try { localStorage.setItem(`fw-${id}`, JSON.stringify(item.state)); } catch (e) {}
  }
  const { plan, state, deletedAt, ...s } = item;
  upsertSession(s);
}

// Definitief wissen uit de prullenbak: één training, of alles.
export function purgeTrash(id) {
  writeTrash(listTrash().filter((x) => x.id !== id));
}

export function emptyTrash() {
  writeTrash([]);
}
