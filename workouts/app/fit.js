// FIT-export voor afgevinkte krachtsets.
// De SDK wordt van buiten aangeleverd (browser: jsdelivr-import in app.js, test: lokaal pakket),
// zodat deze module zowel in de browser als in Node werkt.

// Zoekt het numerieke subtype-ID op naam, bijvoorbeeld "benchPress" + "barbellBenchPress" -> 1.
export function subtypeId(sdk, category, subtype) {
  if (!subtype) return undefined;
  const table = sdk.Profile.types[category + "ExerciseName"];
  if (!table) return undefined;
  const hit = Object.entries(table).find(([, name]) => name === subtype);
  return hit ? Number(hit[0]) : undefined;
}

// sets: [{ exercise, category, subtype, label, weight (kg), reps (of null), doneAt (ms epoch) }]
// Volgorde is de volgorde waarin je afvinkt. Elke set krijgt als starttijd het moment van de vorige afvinking,
// dus de duur is de werkelijke tijd sinds de vorige set (inclusief rust).
export function buildFit(sdk, { sessionStartMs, sets, title }) {
  const { Encoder, Profile } = sdk;
  const enc = new Encoder();
  const start = new Date(sessionStartMs);
  const end = sets.length ? new Date(sets[sets.length - 1].doneAt) : start;
  const totalSec = Math.max(1, (end - start) / 1000);

  enc.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: "activity",
    manufacturer: "development",
    product: 0,
    timeCreated: start,
  });

  let prev = start;
  for (const s of sets) {
    const done = new Date(s.doneAt);
    const durSec = Math.max(1, (done - prev) / 1000);
    const msg = {
      mesgNum: Profile.MesgNum.SET,
      timestamp: done,
      startTime: prev,
      duration: durSec,
      setType: "active",
      category: s.category,
      weight: s.weight,
    };
    const sub = subtypeId(sdk, s.category, s.subtype);
    if (sub !== undefined) msg.categorySubtype = sub;
    if (s.reps !== null && s.reps !== undefined && s.reps !== "") msg.repetitions = Number(s.reps);
    enc.writeMesg(msg);
    prev = done;
  }

  enc.writeMesg({
    mesgNum: Profile.MesgNum.SESSION,
    timestamp: end,
    startTime: start,
    sport: "training",
    subSport: "strengthTraining",
    totalElapsedTime: totalSec,
    totalTimerTime: totalSec,
    messageIndex: 0,
  });

  enc.writeMesg({
    mesgNum: Profile.MesgNum.ACTIVITY,
    timestamp: end,
    totalTimerTime: totalSec,
    numSessions: 1,
    type: "manual",
    event: "activity",
    eventType: "stop",
  });

  return enc.close();
}

// Geplande krachtworkout (bestandstype "workout") met een stap per set en aparte ruststappen.
// Garmin Connect importeert dit als training onder Trainingen, en niet als activiteit.
// steps: [{ name, category, subtype, reps (of null), weight (kg) }] of [{ rest: true, restSec }]
export function buildWorkoutFit(sdk, { title, steps }) {
  const { Encoder, Profile } = sdk;
  const enc = new Encoder();

  enc.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: "workout",
    manufacturer: "development",
    product: 0,
    timeCreated: new Date(),
  });

  enc.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    wktName: title,
    sport: "training",
    subSport: "strengthTraining",
    numValidSteps: steps.length,
  });

  steps.forEach((s, i) => {
    const msg = { mesgNum: Profile.MesgNum.WORKOUT_STEP, messageIndex: i, targetType: "open" };
    if (s.rest) {
      msg.wktStepName = "Rust";
      msg.intensity = "rest";
      msg.durationType = "time";
      msg.durationValue = Math.round(s.restSec * 1000); // ruwe waarde in milliseconden
    } else {
      msg.wktStepName = s.name;
      msg.intensity = "active";
      if (s.reps !== null && s.reps !== undefined) {
        msg.durationType = "reps";
        msg.durationValue = Number(s.reps);
      } else {
        msg.durationType = "open";
      }
      if (s.category) msg.exerciseCategory = s.category;
      const sub = subtypeId(sdk, s.category, s.subtype);
      if (sub !== undefined) msg.exerciseName = sub;
      if (s.weight) msg.exerciseWeight = s.weight;
    }
    enc.writeMesg(msg);
  });

  return enc.close();
}
