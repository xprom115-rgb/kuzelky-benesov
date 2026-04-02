import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const listEl = document.getElementById("reservations-list");

function pad2(n){ return String(n).padStart(2,"0"); }

function formatDate(isoDate){
  // isoDate: YYYY-MM-DD
  if (!isoDate || isoDate.length < 10) return isoDate || "";
  const [y,m,d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function parseSortKey(r){
  // řazení podle data, start, lane
  // start je "HH:00"
  const dateKey = r.date || "9999-99-99";
  const startKey = r.start || "99:99";
  const laneKey = pad2(r.lane || 9);
  return `${dateKey} ${startKey} ${laneKey}`;
}

function render(reservations){
  if (!reservations.length){
    listEl.innerHTML = "<p><em>Zatím nejsou žádné rezervace.</em></p>";
    return;
  }

  // seřadit
  reservations.sort((a,b) => parseSortKey(a).localeCompare(parseSortKey(b)));

  // vystavět HTML
  const html = reservations.map(r => {
    const stornoLink = `${BASE_URL}rezervace-storno.html?id=${encodeURIComponent(r.id || "")}`;
    const date = formatDate(r.date);
    const lane = r.lane ?? "";
    const start = r.start ?? "";
    const end = r.end ?? "";
    const name = r.name ?? "";

    return `
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.15);">
        <div>
          <strong>${date}</strong> —
          Dráha <strong>${lane}</strong> —
          <strong>${start}–${end}</strong> —
          ${name}
        </div>
        <div>
          <a href="${stornoLink}" style="color:#ffd700; font-weight:bold;">Storno</a>
        </div>
      </div>
    `;
  }).join("");

  listEl.innerHTML = html;
}

// realtime načítání
onSnapshot(collection(db, "reservations"), (snap) => {
  const reservations = snap.docs.map(d => d.data());
  render(reservations);
}, (err) => {
  console.error(err);
  listEl.innerHTML = "<p><strong>Chyba načítání rezervací.</strong></p>";
});
``
