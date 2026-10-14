// Deelplaatjes voor Garmin, Strava en Instagram. Alles op canvas, geen externe bronnen.
// Garmin (1080×1080): hoofdcijfer en de drie kengetallen, verder niets.
// Strava (1080×1080) en Instagram (1080×1350): daarnaast een balk per blok en de zwaarste set per oefening.
// Alles wordt van boven naar beneden gelegd en begrensd door de voettekst, dus er overlapt niets.

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

// Grootste lettergrootte tussen startPx en 18px waarbij de tekst binnen maxW past, met het juiste lettertype.
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

// s: { title, dateLabel, startLabel, sets, volume, minutes, blocks: [{title, sets}], top: [{name, text}] }
export function renderShare(kind, s) {
  const f = FORMATS[kind];
  const W = f.w;
  const H = f.h;
  const pad = 80;
  const inner = W - pad * 2;
  const bottom = H - 160; // alles eindigt hierboven, de voettekst staat eronder

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const text = (t, x, y, font, color) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  };

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // datum en titel (max. twee regels)
  text(s.dateLabel.toUpperCase(), pad, 110, `600 30px ${FONT}`, C.accent);
  const titlePx = fitPx(ctx, s.title, inner, kind === "instagram" ? 96 : 84, "700", FONT);
  const lh = Math.round(titlePx * 1.1);
  ctx.font = `700 ${titlePx}px ${FONT}`;
  ctx.fillStyle = C.ink;
  let y = 190;
  const titleLines = wrap(ctx, s.title, inner);
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += lh;
  }
  y -= lh; // baseline van de laatste titelregel

  // hoofdcijfer: het volume
  const heroLabel = y + 90;
  const volText = `${Math.round(s.volume).toLocaleString(locale())} ${t("unit.kg")}`;
  const heroPx = fitPx(ctx, volText, inner, kind === "garmin" ? 230 : 180, "600", MONO);
  text(t("share.volume"), pad, heroLabel, `600 26px ${FONT}`, C.muted);
  text(volText, pad, heroLabel + 30 + Math.round(heroPx * 0.72), `600 ${heroPx}px ${MONO}`, C.warm);
  const heroBase = heroLabel + 30 + Math.round(heroPx * 0.72);

  // kengetallen: sets, duur, oefeningen
  const statsLabel = heroBase + 90;
  const colW = inner / 3;
  const stats = [
    [t("share.sets"), String(s.sets)],
    [t("share.duration"), `${Math.round(s.minutes)} ${t("unit.min")}`],
    [t("share.exercises"), String(s.top.length)],
  ];
  stats.forEach(([label, value], i) => {
    const x = pad + i * colW;
    text(label.toUpperCase(), x, statsLabel, `600 24px ${FONT}`, C.muted);
    const px = fitPx(ctx, value, colW - 24, 64, "600", MONO);
    text(value, x, statsLabel + 70, `600 ${px}px ${MONO}`, C.ink);
  });
  let cursor = statsLabel + 70;

  if (kind === "garmin") return footer(ctx, s, W, H, pad);

  // balk per blok: hoeveel sets je per spiergroep hebt afgevinkt
  const blocks = s.blocks || [];
  const maxSets = Math.max(1, ...blocks.map((b) => b.sets));
  const barRowH = kind === "instagram" ? 84 : 66;
  const barsLabel = cursor + 80;
  const barFit = Math.max(0, Math.floor((bottom - barsLabel - 50) / barRowH) + 1);
  // Alleen op Instagram (hoger formaat); op het vierkante Strava-plaatje krijgt de lijst de ruimte.
  const shownBlocks = kind === "instagram" ? blocks.slice(0, barFit) : [];
  if (shownBlocks.length) {
    text(t("share.perBlock"), pad, barsLabel, `600 24px ${FONT}`, C.muted);
    shownBlocks.forEach((b, i) => {
      const base = barsLabel + 50 + i * barRowH;
      ctx.font = `600 30px ${FONT}`;
      const countText = String(b.sets);
      const countW = (() => { ctx.font = `600 30px ${MONO}`; return ctx.measureText(countText).width; })();
      text(ellipsize(ctx, b.title, inner - countW - 30) , pad, base, `600 30px ${FONT}`, C.ink);
      text(countText, W - pad - countW, base, `600 30px ${MONO}`, C.accent);
      ctx.fillStyle = C.line;
      ctx.fillRect(pad, base + 18, inner, 14);
      ctx.fillStyle = C.accent;
      ctx.fillRect(pad, base + 18, Math.max(6, inner * (b.sets / maxSets)), 14);
    });
    cursor = barsLabel + 50 + (shownBlocks.length - 1) * barRowH + 32;
  }

  // zwaarste set per oefening
  if (s.top.length) {
    const listRowH = kind === "instagram" ? 80 : 64;
    const listLabel = cursor + 80;
    const fit = Math.max(0, Math.floor((bottom - listLabel - 50) / listRowH) + 1);
    if (fit > 0) {
      const hidden = s.top.length > fit ? s.top.length - (fit - 1) : 0;
      const shown = hidden ? s.top.slice(0, fit - 1) : s.top.slice(0, fit);
      text(t("share.heaviest"), pad, listLabel, `600 24px ${FONT}`, C.muted);
      shown.forEach((r, i) => {
        const base = listLabel + 50 + i * listRowH;
        ctx.font = `600 34px ${MONO}`;
        const valueW = ctx.measureText(r.text).width;
        text(ellipsize(ctx, r.name, inner - valueW - 30), pad, base, `600 34px ${FONT}`, C.ink);
        text(r.text, W - pad - valueW, base, `600 34px ${MONO}`, C.accent);
      });
      if (hidden) {
        text(t("share.more", { n: hidden }), pad, listLabel + 50 + shown.length * listRowH, `500 28px ${FONT}`, C.muted);
      }
    }
  }

  return footer(ctx, s, W, H, pad);
}

function footer(ctx, s, W, H, pad) {
  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(`${s.startLabel ? t("share.started", { time: s.startLabel }) + " · " : ""}${t("share.footer")}`, pad, H - 70);
  ctx.fillStyle = C.accent;
  ctx.fillRect(pad, H - 46, 120, 6);
  return new Promise((resolve) => ctx.canvas.toBlob((b) => resolve(b), "image/png"));
}

export const SHARE_FORMATS = FORMATS;
