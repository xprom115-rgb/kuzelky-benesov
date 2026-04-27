// =========================================================
// aktuality-page.js  (sjednoceno: rezervace + akce/events)
//
// CO TENTO SOUBOR DĚLÁ:
// 1) Vypíše "Seznam aktuálních rezervací" do #reservations-list
//    - bere kolekci Firestore: reservations
//    - zobrazuje jen dnešní (které ještě neskončily) + budoucí
//    - přidává odkaz na storno (rezervace-storno.html)
// 2) Vypíše "Akce na kuželně" do #eventsNews
//    - bere kolekci Firestore: events
//    - zobrazuje dnešní + budoucí akce
//    - zobrazuje SKUTEČNÝ čas start–end (ne blokaci)
// =========================================================

import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";

import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// =========================================================
// DOM
// =========================================================
const resListEl = document.getElementById("reservations-list");
const eventsEl = document.getElementById("eventsNews");

// =========================================================
// Helpery: datum/čas
// =========================================================
function toMinutes(t) {
  // "HH:MM" -> minuty od 00:00
  const m = (t || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return (Number(m[1]) * 60) + Number(m[2]);
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(isoDate) {
  // YYYY-MM-DD -> DD.MM.YYYY
  if (!isoDate || isoDate.length < 10) return isoDate || "";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function sortKeyReservation(r) {
  const date = r.date || "9999-99-99";
  const start = r.start || "99:99";
  const lane = String(r.lane ?? 9).padStart(2, "0");
  return `${date} ${start} ${lane}`;
}

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// =========================================================
// 1) REZERVACE -> #reservations-list
// =========================================================
function renderReservations(reservations) {
  if (!resListEl) return;

  const now = new Date();
  const today = todayIso();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Zobrazíme jen:
  // - budoucí dny
  // - dnešní rezervace, které ještě neskončily
  const filtered = (reservations || []).filter(r => {
    if (!r.date) return false;

    if (r.date > today) return true;      // budoucí dny
    if (r.date < today) return false;     // minulost pryč

    // dnes
    if (!r.end) return true;              // když chybí end, raději ukázat
    return toMinutes(r.end) > nowMin;     // dnešní jen pokud ještě neskončila
  });

  if (!filtered.length) {
    resListEl.innerHTML = "<p><em>Zatím nejsou žádné rezervace.</em></p>";
    return;
  }

  filtered.sort((a, b) => sortKeyReservation(a).localeCompare(sortKeyReservation(b)));

  // Storno bez předávání kódu – zákazník ho zadá ručně
  const stornoHref = `${BASE_URL}rezervace-storno.html`;

  resListEl.innerHTML = filtered.map(r => {
    return `
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.15);">
        <div>
          <strong>${esc(formatDate(r.date))}</strong> —
          Dráha <strong>${esc(r.lane)}</strong> —
          <strong>${esc(r.start)}–${esc(r.end)}</strong> —
          ${esc(r.name || "")}
        </div>
        <div>
          <a href="${esc(stornoHref)}" style="color:#ffd700; font-weight:bold).join("");
}

function initReservations() {
  if (!resListEl) return;

  // Realtime načítání rezervací
  onSnapshot(
    collection(db, "reservations"),
    (snap) => {
      const reservations = snap.docs.map(d => d.data());
      renderReservations(reservations);
    },
    (err) => {
      console.error("Chyba onSnapshot reservations:", err);
      resListEl.innerHTML = "<p><strong>Chyba načítání rezervací.</strong></p>";
    }
  );
}

// =========================================================
// 2) EVENTS (AKCE) -> #eventsNews
// =========================================================
function eventLabel(ev) {
  if (ev.type === "match") return `Zápas ${ev.team || ""}`.trim();
  return ev.title || "Turnaj";
}

function renderEvents(items) {
  if (!eventsEl) return;

  const today = todayIso();
  const future = (items || []).filter(ev => (ev.date || "") >= today);

  if (!future.length) {
    eventsEl.innerHTML = "<em>Zatím nejsou naplánované žádné akce.</em>";
    return;
  }

  eventsEl.innerHTML = future.map(ev => {
    // TADY je požadavek: zobrazujeme skutečný čas start–end
    const line = `${formatDate(ev.date)} — ${ev.start}–${ev.end} — ${eventLabel(ev)}`;
    return `<div style="margin:2px 0;">
      <strong>${esc(formatDate(ev.date))}</strong> —
      <strong>${esc(ev.start)}–${esc(ev.end)}</strong> —
      ${esc(eventLabel(ev))}
      ${ev.note ? ` — <span style="opacity:0.85;">${esc(ev.note)}</span>` : ""}
    </div>`;
  }).join("");
}

function initEvents() {
  if (!eventsEl) return;

  // Realtime načítání akcí – hned se promítnou změny z admin-akce
  const q = query(collection(db, "events"), orderBy("date"), orderBy("start"));

  onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderEvents(items);
    },
    (err) => {
      console.error("Chyba onSnapshot events:", err);
      eventsEl.innerHTML = "<em>Nelze načíst akce (zkontroluj Firestore Rules pro events).</em>";
    }
  );
}

// =========================================================
// Start
// =========================================================
initReservations();
initEvents();
