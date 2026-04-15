import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ habadura-sezony.js načten");

const listEl = document.getElementById("seasonsList");
if (!listEl) {
  console.error('❌ Chybí element id="seasonsList" v habadura-sezony.html');
}

function btn(href, text, enabled) {
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

    const r1 = !!s.round1Published;
    const r2 = !!s.round2Published;
    const r3 = !!s.round3Published;
    const has3 = (s.hasRound3 === true);
    const fin = !!s.finalPublished;

    const href1 = `habadura-vysledky.html?season=${encodeURIComponent(s.id)}&round=1`;
    const href2 = `habadura-vysledky.html?season=${encodeURIComponent(s.id)}&round=2`;
    const href3 = `habadura-vysledky.html?season=${encodeURIComponent(s.id)}&round=3`;
    const hrefF = `habadura-vysledky.html?season=${encodeURIComponent(s.id)}&round=final`;

    const activeRound = Number(s.activeRound || 1);

    return `
      <div class="season-card">
        <h3>${label}${activeTag}</h3>
        <div class="meta">ID: ${s.id} • aktivní: kolo ${activeRound}</div>

        <div class="actions">
          ${btn(href1, "1. kolo", r1)}
          ${btn(href2, "2. kolo", r2)}
          ${btn(href3, "3. kolo", has3 && r3)}
          ${btn(hrefF, "Finální", fin)}
        </div>

        <div class="meta" style="margin-top:10px;">
          1: ${r1 ? "uloženo" : "ne"} •
          2: ${r2 ? "uloženo" : "ne"} •
          3: ${has3 ? (r3 ? "uloženo" : "ne") : "nehraje se"} •
          finále: ${fin ? "uloženo" : "ne"}
        </div>
      </div>
    `;
  }).join("");
}

// realtime načítání seasons
onSnapshot(
  collection(db, "seasons"),
  (snap) => {
    const seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log("✅ seasons načteno:", seasons.length);
    render(seasons);
  },
  (err) => {
    console.error("❌ seasons onSnapshot error:", err);
    if (listEl) listEl.innerHTML = "<p><strong>Chyba načítání sezón.</strong></p>";
  }
);
``
