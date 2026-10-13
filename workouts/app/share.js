// Deelplaatjes voor Garmin, Strava en Instagram. Alles op canvas, geen externe bronnen.
// Garmin: alleen de cijfers (1080×1080). Strava: cijfers plus zwaarste set per oefening (1080×1080).
// Instagram: zelfde inhoud, staand 4:5 (1080×1350).

const FORMATS = {
  garmin: { w: 1080, h: 1080, label: "Garmin" },
  strava: { w: 1080, h: 1080, label: "Strava" },
  instagram: { w: 1080, h: 1350, label: "Instagram" },
};

const C = {
  bg: "#0f171e",
  ink: "#e7edf2",
  muted: "#9aa9b6",
  accent: "#4cc2b6",
  warm: "#f0a35e",
  line: "#2a3844",
};
const FONT = '"Helvetica Neue", Arial, system-ui, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

// Woorden samenvoegen tot regels die binnen maxW passen; woorden worden nooit gebroken.
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Kleinste lettergrootte tussen startPx en 18px waarbij de tekst binnen maxW past. Meet met het juiste lettertype.
function fitPx(ctx, text, maxW, startPx, weight, family) {
  let px = startPx;
  while (px > 18) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    px -= 2;
  }
  return px;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// summary: { title, dateLabel, startLabel, sets, volume, minutes, top: [{ name, text }] }
export function renderShare(kind, s) {
  const f = FORMATS[kind];
  const cv = document.createElement("canvas");
  cv.width = f.w;
  cv.height = f.h;
  const ctx = cv.getContext("2d");
  const W = f.w;
  const H = f.h;
  const pad = 80;
  const inner = W - pad * 2;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // datum en titel
  ctx.fillStyle = C.accent;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(s.dateLabel.toUpperCase(), pad, 110);

  const titlePx = fitPx(ctx, s.title, inner, kind === "instagram" ? 96 : 84, "700", FONT);
  ctx.fillStyle = C.ink;
  ctx.font = `700 ${titlePx}px ${FONT}`;
  let y = 200;
  for (const line of wrap(ctx, s.title, inner)) {
    ctx.fillText(line, pad, y);
    y += Math.round(titlePx * 1.1);
  }

  // cijfers: drie kolommen, elk op de eigen breedte gemeten met het monospace-lettertype
  const statY = y + 70;
  const colW = inner / 3;
  const stats = [
    ["Sets", String(s.sets)],
    ["Volume", `${Math.round(s.volume).toLocaleString("nl-NL")} kg`],
    ["Duur", `${Math.round(s.minutes)} min`],
  ];
  stats.forEach(([label, value], i) => {
    const x = pad + i * colW;
    ctx.fillStyle = C.muted;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x, statY);
    ctx.fillStyle = i === 1 ? C.warm : C.ink;
    const px = fitPx(ctx, value, colW - 24, 84, "600", MONO);
    ctx.font = `600 ${px}px ${MONO}`;
    ctx.fillText(value, x, statY + 96);
  });

  // zwaarste set per oefening (niet voor Garmin: daar alleen de cijfers)
  if (kind !== "garmin") {
    const listTop = statY + 170;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, listTop - 30);
    ctx.lineTo(W - pad, listTop - 30);
    ctx.stroke();

    const rowH = kind === "instagram" ? 92 : 76;
    // Alleen rijen die boven de voettekst passen (voettekst staat op H-70, de balk op H-46).
    const fit = Math.max(1, Math.floor((H - 160 - listTop) / rowH) + 1);
    const hidden = s.top.length > fit ? s.top.length - (fit - 1) : 0;
    const shown = hidden ? s.top.slice(0, fit - 1) : s.top.slice(0, fit);
    shown.forEach((r, i) => {
      const ry = listTop + i * rowH;
      const valueW = (() => { ctx.font = `600 34px ${MONO}`; return ctx.measureText(r.text).width; })();
      ctx.fillStyle = C.ink;
      ctx.font = `600 36px ${FONT}`;
      ctx.fillText(ellipsize(ctx, r.name, inner - valueW - 40), pad, ry + 40);
      ctx.fillStyle = C.accent;
      ctx.font = `600 34px ${MONO}`;
      ctx.fillText(r.text, W - pad - valueW, ry + 40);
    });
    if (hidden) {
      ctx.fillStyle = C.muted;
      ctx.font = `500 30px ${FONT}`;
      ctx.fillText(`+ ${hidden} meer`, pad, listTop + shown.length * rowH + 40);
    }
  }

  // voet
  ctx.fillStyle = C.muted;
  ctx.font = `500 26px ${FONT}`;
  const foot = `${s.startLabel ? "Gestart " + s.startLabel + " · " : ""}Afgevinkt in de pushpagina`;
  ctx.fillText(foot, pad, H - 70);
  ctx.fillStyle = C.accent;
  ctx.fillRect(pad, H - 46, 120, 6);

  return new Promise((resolve) => cv.toBlob((b) => resolve(b), "image/png"));
}

export const SHARE_FORMATS = FORMATS;
