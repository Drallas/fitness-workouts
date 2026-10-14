// Workout-generator. Pure functie: geen DOM, geen netwerk, dus testbaar in Node.
// Uitvoer heeft dezelfde vorm als workouts/push-2026-10-13.json (blocks → exercises → sets),
// zodat fit.js en share.js ongewijzigd blijven werken.

const SET_SEC = 45;            // schatting werktijd per set
const WARMUP_MIN = 5;          // vaste opwarming
const RULE_HOURS = 48;         // benen niet binnen 48 uur na of voor intervallen
const COMPOUND_SETS = { laag: 2, midden: 3, hoog: 4 };
const ENERGY_DOWN = { hoog: "midden", midden: "laag", laag: "laag" };
const REPS_BY_KIND = { compound: 8, isolatie: 12 };
const REPS_BY_ID = { "lat-pulldown": 10, "hanging-knee": 15, "face-pull": 15, dips: 8 };

// Schatting in minuten: per set 45 s werk, rust tussen de sets, plus opwarming.
export function estimateMinutes(exercises) {
  let sec = 0;
  for (const ex of exercises) {
    const n = ex.sets.length;
    sec += n * SET_SEC + Math.max(0, n - 1) * (ex.rest || 0);
  }
  return sec / 60 + WARMUP_MIN;
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Met seconden, zodat twee trainingen binnen één minuut elk een eigen id krijgen.
const hm = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function joinNl(labels) {
  if (labels.length <= 1) return labels.join("");
  return labels.slice(0, -1).join(", ") + " en " + labels.at(-1);
}

export function generate(input, lib, history = {}, now = new Date()) {
  // history: subtype → laatst gebruikt gewicht (per hand bij dumbbell), uit de app-geschiedenis.
  const notes = [];
  const groupsOrdered = lib.groups.map((g) => g.id).filter((id) => input.groups.includes(id));
  if (!groupsOrdered.length) throw new Error("Kies minstens één spiergroep.");

  const minutes = Number(input.minutes) || 60;
  const readiness = Number.isFinite(Number(input.readiness)) && input.readiness !== "" ? Number(input.readiness) : null;
  const body = Number.isFinite(Number(input.body)) && input.body !== "" ? Number(input.body) : null;

  // Energie bepaalt het volume; bij lage readiness of bodybatterij één stap omlaag.
  let energy = ENERGY_DOWN[input.energy] && input.energy ? input.energy : "midden";
  const low = (readiness !== null && readiness < 60) || (body !== null && body < 50);
  if (low) {
    energy = ENERGY_DOWN[energy];
    notes.push(
      `Readiness ${readiness ?? "–"} en bodybatterij ${body ?? "–"}: het volume is één stap lager gezet. Houd het licht en stop eerder als de bar traag wordt.`
    );
  }

  // Eerst alle compound-oefeningen (per groep), daarna de isolatie-oefeningen.
  const items = [];
  for (const g of groupsOrdered) {
    const c = lib.exercises.find((e) => e.group === g && e.kind === "compound");
    if (c) items.push({ lib: c, role: "compound", group: g, sets: COMPOUND_SETS[energy] });
  }
  for (const g of groupsOrdered) {
    const i = lib.exercises.find((e) => e.group === g && e.kind === "isolatie");
    if (i) items.push({ lib: i, role: "isolatie", group: g, sets: Math.max(2, COMPOUND_SETS[energy] - 1) });
  }

  const toList = () => items.map((it) => ({ rest: it.lib.rest, sets: Array.from({ length: it.sets }) }));

  // Te lang: eerst isolatie weglaten (van achteren), daarna de laatste compound.
  let est = estimateMinutes(toList());
  while (est > minutes && items.length > 1) {
    let idx = -1;
    for (let k = items.length - 1; k >= 0; k--) if (items[k].role === "isolatie") { idx = k; break; }
    if (idx < 0) idx = items.length - 1;
    items.splice(idx, 1);
    est = estimateMinutes(toList());
  }
  if (est > minutes) notes.push(`Zelfs met één oefening per groep duurt het naar schatting ${Math.round(est)} min. Kies meer minuten of minder groepen.`);

  // Blokken per spiergroep, met letters als in de push-workout.
  const blocks = groupsOrdered.map((g, gi) => {
    const label = lib.groups.find((x) => x.id === g).label;
    const exercises = items
      .filter((it) => it.group === g)
      .map((it) => {
        const e = it.lib;
        const w = history?.[e.subtype] ?? null;
        const reps = REPS_BY_ID[e.id] ?? REPS_BY_KIND[e.kind] ?? 10;
        const ex = {
          id: e.id,
          name: e.name,
          category: e.category,
          subtype: e.subtype,
          rest: e.rest,
          demo: "https://www.youtube.com/results?search_query=" + encodeURIComponent(e.name + " techniek"),
          sets: Array.from({ length: it.sets }, (_, k) => ({
            label: `Set ${k + 1}`,
            weight: w,
            reps,
          })),
        };
        if (e.dumbbell) ex.dumbbell = true;
        return ex;
      });
    return { tag: String.fromCharCode(65 + gi), title: label, exercises };
  });

  // Regels uit het trainingsschema.
  if (groupsOrdered.includes("benen") && input.lastLegsAt) {
    const last = new Date(input.lastLegsAt);
    const hours = (now - last) / 3600000;
    if (hours < RULE_HOURS) {
      notes.push(
        `Benen liggen minder dan ${RULE_HOURS} uur na je vorige intervallen of lange sessie (${Math.round(hours)} uur). Overweeg benen weg te laten of de squat te vervangen door een lichter werk.`
      );
    }
  }
  notes.unshift(`Opwarmen ongeveer ${WARMUP_MIN} min, daarna de blokken hieronder.`);

  return {
    id: `gen-${ymd(now)}-${hm(now)}`,
    title: joinNl(groupsOrdered.map((g) => lib.groups.find((x) => x.id === g).label)),
    date: ymd(now),
    sport: "strengthTraining",
    estMinutes: Math.round(estimateMinutes(toList())),
    notes,
    blocks,
  };
}
