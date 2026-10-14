// Menubalk voor alle pagina's. Zet de balk in het element met id "nav" en markeert de actieve pagina.
// Eerste regel: titel, taalkeuze en profiel (helemaal rechts). Tweede regel: de pagina's.
import { loadProfile } from "./stats.js";
import { t, getLang, setLang, LANGS } from "./i18n.js";

// Subtiel merkteken: een halter in één lijn, in de accentkleur.
export const LOGO = `<svg class="mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h18"/><path d="M6.5 8.5v7M17.5 8.5v7"/><path d="M3.5 10v4M20.5 10v4" stroke-width="1.6"/></g></svg>`;

const ITEMS = [
  { id: "start", href: "index.html", key: "nav.start" },
  { id: "trainingen", href: "trainingen.html", key: "nav.trainings" },
  { id: "geschiedenis", href: "geschiedenis.html", key: "nav.history" },
  { id: "instellingen", href: "instellingen.html", key: "nav.settings" },
  { id: "help", href: "help.html", key: "nav.help" },
];

export function renderNav(active) {
  const el = document.getElementById("nav");
  if (!el) return;
  const p = loadProfile();
  const initials = (p.name || "A").trim().slice(0, 1).toUpperCase();
  const avatar = p.photo ? `<img src="${p.photo}" alt="">` : initials;
  const lang = getLang();
  el.innerHTML = `
    <nav class="top" aria-label="${t("nav.menu")}">
      <a class="brand" href="index.html">${LOGO}<span>${t("brand")}</span></a>
      <select class="lang" id="langsel" aria-label="${t("nav.lang")}">
        ${LANGS.map((l) => `<option value="${l.code}"${l.code === lang ? " selected" : ""}>${l.code.toUpperCase()}</option>`).join("")}
      </select>
      <a class="prof" href="profiel.html" aria-label="${t("nav.profile")}"${active === "profiel" ? ' aria-current="page"' : ""}>${avatar}</a>
      <div class="menu">
        ${ITEMS.map((i) => `<a class="nv" href="${i.href}"${i.id === active ? ' aria-current="page"' : ""}>${t(i.key)}</a>`).join("")}
      </div>
    </nav>`;
  // Voettekst op elke pagina: copyright en een link naar de broncode op GitHub.
  let foot = document.getElementById("foot");
  if (!foot) {
    foot = document.createElement("footer");
    foot.id = "foot";
    foot.className = "foot";
    document.body.appendChild(foot);
  }
  foot.innerHTML = `${t("foot.copy", { year: new Date().getFullYear() })} · <a href="https://github.com/Drallas/fitness-workouts" target="_blank" rel="noopener">${t("foot.code")}</a>`;

  // Andere taal: de pagina laadt opnieuw, zodat alle teksten in de nieuwe taal komen.
  document.getElementById("langsel").addEventListener("change", (e) => {
    setLang(e.target.value);
    location.reload();
  });
}
