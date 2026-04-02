import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";

import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("aktuality.js načten");

const listEl = document.getElementById("reservations-list");

function formatDate(isoDate){
  if (!isoDate || isoDate.length < 10) return isoDate || "";
  const [y,m,d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function sortKey(r){
  const date = r.date || "9999-99-99";
  const start = r.start || "99:99";
  const lane = String(r.lane ?? 9).padStart(2,"0");
  return `${date} ${start} ${lane}`;
}

function render(reservations){
  if (!reservations.length){
    listEl.innerHTML = "<p><em>Zatím nejsou žádné rezervace.</em></p>";
    return;
  }

  reservations.sort((a,b) => sortKey(a).localeCompare(sortKey(b)));

  listEl.innerHTML = reservations.map(r => {
    // ✅ Storno bez předávání kódu – zákazník ho musí zadat ručně
    const stornoHref = `${BASE_URL}rezervace-storno.html`;

    return `
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.15);">
        <div>
          <strong>${formatDate(r.date)}</strong> —
          Dráha <strong>${r.lane}</strong> —
          <strong>${r.start}–${r.end}</strong> —
          ${r.name || ""}
        </div>
        <div>
          <a href="${stornoHref}" style="color:#ffd700; font-weight:bold;">Storno</a>
        </div>
      </div>
    `;
  }).join("");
}

onSnapshot(collection(db, "reservations"), (snap) => {
  const reservations = snap.docs.map(d => d.data());
  console.log("Načteno rezervací:", reservations.length);
  render(reservations);
}, (err) => {
  console.error("Chyba onSnapshot:", err);
  listEl.innerHTML = "<p><strong>Chyba načítání rezervací.</strong></p>";
});
