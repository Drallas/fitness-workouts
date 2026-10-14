// Afgeronde trainingen naar de repo zetten via de GitHub-API. Dit werkt vanuit de statische pagina,
// met een fine-grained token dat alleen deze repo ziet en alleen Contents mag schrijven.
// Het token staat in localStorage van dit apparaat en gaat nergens anders heen.

import { allRecords } from "./stats.js";

const REPO = "Drallas/fitness-workouts";
const BRANCH = "main";
const DIR = "workouts/done";
const TOKEN_KEY = "fw-gh-token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
}

export function setToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch (e) { return false; }
}

const b64encode = (str) => {
  let bin = "";
  for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}${method === "GET" ? `?ref=${BRANCH}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}

// Bestaand bestand ophalen: { sha, text } of null als het niet bestaat.
async function getFile(path) {
  const r = await api(path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  return { sha: j.sha, text: b64decode(j.content) };
}

// Fout met de statuscode als bericht, en de tekst van GitHub zelf als detail, zodat je ziet waarom het mislukt.
async function ghFail(r) {
  const err = new Error(String(r.status));
  try { err.detail = (await r.json()).message || ""; } catch (e) { err.detail = ""; }
  return err;
}

async function putFile(path, text, message, sha) {
  const body = { message, content: b64encode(text), branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await api(path, { method: "PUT", body });
  if (!r.ok) throw await ghFail(r);
}

const safeName = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, "-");

// Afgeronde trainingen die lokaal staan en nog niet in workouts/done/ staan.
export async function pendingRecords() {
  const all = await allRecords();
  const inRepo = new Set(all.filter((r) => r.source === "GitHub").map((r) => r.id));
  return all.filter((r) => r.source === "lokaal" && r.status === "klaar" && !inRepo.has(r.id));
}

// Elk bestand is één commit. index.json krijgt de nieuwe trainingen erbij, zodat de app ze vindt.
export async function syncToGithub(records, onProgress = () => {}) {
  if (!records.length) return 0;
  const idx = await getFile(`${DIR}/index.json`);
  const index = idx ? JSON.parse(idx.text) : [];
  const indexSha = idx ? idx.sha : undefined;
  let n = 0;
  for (const rec of records) {
    const file = `${safeName(rec.id)}.json`;
    const path = `${DIR}/${file}`;
    const existing = await getFile(path);
    const text = JSON.stringify({ versie: 1, plan: rec.plan, state: rec.state }, null, 2) + "\n";
    await putFile(path, text, `Afgerond: ${rec.title} (${rec.date})`, existing ? existing.sha : undefined);
    if (!index.some((i) => i.id === rec.id)) {
      index.push({ id: rec.id, title: rec.title, date: rec.date, file });
    }
    n++;
    onProgress(n);
  }
  index.sort((a, b) => (a.date < b.date ? 1 : -1));
  await putFile(`${DIR}/index.json`, JSON.stringify(index, null, 2) + "\n", `Index workouts/done bijgewerkt (${n} erbij)`, indexSha);
  return n;
}

// Verwijdert een afgeronde training uit de repo: eerst de regel in index.json, daarna het bestand.
export async function deleteFromGithub(id) {
  const idx = await getFile(`${DIR}/index.json`);
  if (!idx) throw new Error("404");
  const index = JSON.parse(idx.text);
  const entry = index.find((i) => i.id === id);
  const file = entry ? entry.file : `${safeName(id)}.json`;
  const path = `${DIR}/${file}`;
  const next = index.filter((i) => i.id !== id);
  await putFile(`${DIR}/index.json`, JSON.stringify(next, null, 2) + "\n", `Index workouts/done bijgewerkt (verwijderd: ${id})`, idx.sha);
  const f = await getFile(path);
  if (!f) return;
  const r = await api(path, { method: "DELETE", body: { message: `Verwijderd: ${entry ? entry.title : id}`, sha: f.sha, branch: BRANCH } });
  if (!r.ok) throw await ghFail(r);
}

// Terugvaloptie zonder token: één JSON-bestand downloaden, dat je zelf naar de repo kunt zetten.
export function exportBlob(records) {
  const out = records.map((r) => ({ versie: 1, plan: r.plan, state: r.state }));
  return new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
}
