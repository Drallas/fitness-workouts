// Deelplaatje: één formaat voor Strava, Instagram en Garmin: 9:16 (1080×1920).
// Van boven naar beneden: datum en titel, kengetallen, records, verdeling per blok, en de oefeningen.
// Alles eindigt boven de voettekst, dus er overlapt niets.

export const SHARE_FORMAT = { w: 1080, h: 1920, label: "9:16" };

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

import { t, locale } from "./i18n.js";

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

// Grootste lettergrootte tussen startPx en 18px waarbij de tekst binnen maxW past.
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

// s: { title, dateLabel, startLabel, sets, volume, minutes, blocks: [{title, sets}],
//      top: [{name, text, count}], records: [{name, text}] }
export function renderShare(s) {
  const { w: W, h: H } = SHARE_FORMAT;
  const pad = 80;
  const inner = W - pad * 2;
  const bottom = H - 180;

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const put = (str, x, y, font, color) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };
  const measure = (str, font) => {
    ctx.font = font;
    return ctx.measureText(str).width;
  };
  const fit = (str, maxW, font) => {
    ctx.font = font;
    return ellipsize(ctx, str, maxW);
  };
  const label = (str, y) => put(str.toUpperCase(), pad, y, `600 26px ${FONT}`, C.muted);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // datum en titel (max. twee regels)
  put(s.dateLabel.toUpperCase(), pad, 130, `600 30px ${FONT}`, C.accent);
  // grootste letter waarbij de titel in hooguit twee regels past
  let titlePx = 88;
  let titleLines;
  for (; titlePx > 40; titlePx -= 2) {
    ctx.font = `700 ${titlePx}px ${FONT}`;
    titleLines = wrap(ctx, s.title, inner);
    if (titleLines.length <= 2) break;
  }
  const lh = Math.round(titlePx * 1.1);
  ctx.font = `700 ${titlePx}px ${FONT}`;
  ctx.fillStyle = C.ink;
  let y = 230;
  for (const line of titleLines.slice(0, 2)) {
    ctx.fillText(line, pad, y);
    y += lh;
  }
  let cur = y - lh + 110;

  // kengetallen: sets, duur, volume
  const colW = inner / 3;
  const stats = [
    [t("share.sets"), String(s.sets), C.ink],
    [t("share.duration"), `${Math.round(s.minutes)} ${t("unit.min")}`, C.ink],
    [t("share.volume"), `${Math.round(s.volume).toLocaleString(locale())} ${t("unit.kg")}`, C.warm],
  ];
  stats.forEach(([lab, val, color], i) => {
    const x = pad + i * colW;
    put(lab.toUpperCase(), x, cur, `600 24px ${FONT}`, C.muted);
    const px = fitPx(ctx, val, colW - 24, 64, "600", MONO);
    put(val, x, cur + 74, `600 ${px}px ${MONO}`, color);
  });
  cur += 74 + 80;

  // records: gewichtrecords en reps-records van vandaag, alleen als er echt een is
  const records = (s.records || []).slice(0, 4);
  if (records.length) {
    label(t("share.records"), cur);
    cur += 46;
    for (const r of records) {
      const vw = measure(r.text, `600 28px ${MONO}`);
      put(fit(r.name, inner - vw - 30, `600 32px ${FONT}`), pad, cur, `600 32px ${FONT}`, C.ink);
      put(r.text, W - pad - vw, cur, `600 28px ${MONO}`, C.warm);
      cur += 68;
    }
    cur += 24;
  }

  // verdeling per blok: hoeveel sets je per spiergroep hebt afgevinkt
  const blocks = s.blocks || [];
  if (blocks.length) {
    const maxSets = Math.max(1, ...blocks.map((b) => b.sets));
    label(t("share.perBlock"), cur);
    cur += 46;
    for (const b of blocks) {
      const countText = String(b.sets);
      const cw = measure(countText, `600 28px ${MONO}`);
      put(fit(b.title, inner - cw - 30, `600 28px ${FONT}`), pad, cur, `600 28px ${FONT}`, C.ink);
      put(countText, W - pad - cw, cur, `600 28px ${MONO}`, C.accent);
      ctx.fillStyle = C.line;
      ctx.fillRect(pad, cur + 14, inner, 12);
      ctx.fillStyle = C.accent;
      ctx.fillRect(pad, cur + 14, Math.max(6, inner * (b.sets / maxSets)), 12);
      cur += 66;
    }
    cur += 24;
  }

  // oefeningen: per oefening de zwaarste set en het aantal sets; wat niet past wordt samengevat
  const exRowH = 76;
  const exercises = s.top || [];
  if (exercises.length) {
    label(t("share.exList"), cur);
    cur += 46;
    const fitRows = Math.max(0, Math.floor((bottom - cur) / exRowH));
    const hidden = exercises.length > fitRows ? exercises.length - Math.max(0, fitRows - 1) : 0;
    const shown = hidden ? exercises.slice(0, Math.max(0, fitRows - 1)) : exercises.slice(0, fitRows);
    for (const r of shown) {
      const vw = measure(r.text, `600 30px ${MONO}`);
      put(fit(r.name, inner - vw - 30, `600 30px ${FONT}`), pad, cur, `600 30px ${FONT}`, C.ink);
      put(r.text, W - pad - vw, cur, `600 30px ${MONO}`, C.accent);
      put(`${r.count} ${t("unit.sets")}`, pad, cur + 32, `500 24px ${FONT}`, C.muted);
      cur += exRowH;
    }
    if (hidden) put(t("share.more", { n: hidden }), pad, cur, `500 26px ${FONT}`, C.muted);
  }

  return footer(ctx, s, W, H, pad);
}

function footer(ctx, s, W, H, pad) {
  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(`${s.startLabel ? t("share.started", { time: s.startLabel }) + " · " : ""}${t("share.footer")}`, pad, H - 90);
  ctx.fillStyle = C.accent;
  ctx.fillRect(pad, H - 66, 120, 6);
  return new Promise((resolve) => ctx.canvas.toBlob((b) => resolve(b), "image/png"));
}
