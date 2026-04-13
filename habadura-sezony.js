import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const listEl = document.getElementById("seasonsList");
if (!listEl) console.error('Chybí element id="seasonsList" v habadura-sezony.html');

function phaseLabel(phase) {
  return phase === "spring" ? "jaro" : "podzim";
}

function btn(href, text, enabled) {
  // enabled => klikací tlačítko; jinak šedé a neklikací
  const cls = enabled ? "btn-link" : "btn-link disabled";
  const safeHref = enabled ? href : "#";
  return `<a class="${cls}" href="${safeHref}">${text}</a>`;
}

function render(seasons) {
  if (!listEl) return;

  if (!seasons.length) {
    listEl.innerHTML = "<p><em>Zatím nejsou žádné sezóny.</em></p>";
    return;
  }

  // nejnovější nahoře
  seasons.sort((a, b) => (b.id || "").localeCompare(a.id || ""));

  listEl.innerHTML = seasons.map(s => {
    const label = s.label || s.id;
    const activeTag = s.isActive ? " (aktivní)" : "";

    const autumnOk = !!s.autumnPublished;
    const springOk = !!s.springPublished;
    const finalOk  = autumnOk && springOk;

    const autumnHref = `habadura-vysledky.html?season=${encodeURIComponent(s.id)}&phase=autumn`;
    const springHref = `habadura-vysledky.html?season=${encodeURIComponent(s.id)}&phase=spring`;
    const finalHref  = `habadura-vysledky.html?season=${encodeURIComponent(s.id)}&phase=final`;

    return `
      <div class="season-card">
        <h3>${label}${activeTag}</h3>
        <div class="meta">
          ID: ${s.id} • aktivní fáze: ${phaseLabel(s.activePhase || "autumn")}
        </div>

        <div class="actions">
          ${btn(autumnHref, "Výsledky podzim", autumnOk)}
          ${btn(springHref, "Výsledky jaro", springOk)}
          ${btn(finalHref,  "Finální",        finalOk)}
        </div>

        <div class="meta" style="margin-top:10px;">
          Podzim: ${autumnOk ? "uložen" : "neuzavřen"} • Jaro: ${springOk ? "uložen" : "neuzavřen"}
        </div>
      </div>
    `;
  }).join("");
}

onSnapshot(collection(db, "seasons"), (snap) => {
  const seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(seasons);
}, (err) => {
  console.error(err);
  if (listEl) listEl.innerHTML = "<p><strong>Chyba načítání sezón.</strong></p>";
});
