// aktuality-page.js – rezervace více drah + akce
import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const resListEl = document.getElementById("reservations-list");
const eventsEl = document.getElementById("eventsNews");

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function toMinutes(t) {
  const m = (t || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatDate(isoDate) {
  if (!isoDate || isoDate.length < 10) return isoDate || "";
  const [y,m,d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// Podpora nových rezervací (lanes) i starších rezervací (lane).
function reservationLanes(r) {
  const source = Array.isArray(r.lanes) ? r.lanes : [r.lane];
  return [...new Set(source.map(Number).filter(n => n >= 1 && n <= 4))].sort((a,b) => a-b);
}
function lanesLabel(r) {
  const lanes = reservationLanes(r);
  if (lanes.length === 4) return "Všechny dráhy";
  if (lanes.length === 1) return `Dráha ${lanes[0]}`;
  if (lanes.length > 1) return `Dráhy ${lanes.join(", ")}`;
  return "Dráha neuvedena";
}
function sortKeyReservation(r) {
  const firstLane = reservationLanes(r)[0] ?? 9;
  return `${r.date || "9999-99-99"} ${r.start || "99:99"} ${String(firstLane).padStart(2,"0")}`;
}

function renderReservations(reservations) {
  if (!resListEl) return;
  const now = new Date(), today = todayIso();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const filtered = (reservations || []).filter(r => {
    if (!r.date) return false;
    if (r.date > today) return true;
    if (r.date < today) return false;
    return !r.end || toMinutes(r.end) > nowMin;
  });
  if (!filtered.length) {
    resListEl.innerHTML = "<p><em>Zatím nejsou žádné rezervace.</em></p>";
    return;
  }
  filtered.sort((a,b) => sortKeyReservation(a).localeCompare(sortKeyReservation(b)));
  const stornoHref = `${BASE_URL}rezervace-storno.html`;
  resListEl.innerHTML = filtered.map(r => `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.15);">
      <div>
        <strong>${esc(formatDate(r.date))}</strong> —
        <strong>${esc(lanesLabel(r))}</strong> —
        <strong>${esc(r.start)}–${esc(r.end)}</strong> —
        ${esc(r.name || "")}
      </div>
      <div><a href="${esc(stornoHref)}" style="color:#ffd700; font-weight:bold;">Storno</a></div>
    </div>`).join("");
}
function initReservations() {
  if (!resListEl) return;
  onSnapshot(collection(db,"reservations"), snap => renderReservations(snap.docs.map(d => d.data())), err => {
    console.error("Chyba onSnapshot reservations:",err);
    resListEl.innerHTML = "<p><strong>Chyba načítání rezervací.</strong></p>";
  });
}
function eventLabel(ev) {
  if (ev?.type === "match") return `Zápas ${ev.team || ""}`.trim();
  return ev?.title || "Turnaj";
}
function renderEvents(items) {
  if (!eventsEl) return;
  const future = (items || []).filter(ev => (ev.date || "") >= todayIso());
  if (!future.length) { eventsEl.innerHTML = "<em>Zatím nejsou naplánované žádné akce.</em>"; return; }
  eventsEl.innerHTML = future.map(ev => `<div style="margin:2px 0;"><strong>${esc(formatDate(ev.date))}</strong> — <strong>${esc(ev.start)}–${esc(ev.end)}</strong> — ${esc(eventLabel(ev))}${ev.note ? ` — <span style="opacity:0.85;">${esc(ev.note)}</span>` : ""}</div>`).join("");
}
function initEvents() {
  if (!eventsEl) return;
  const q = query(collection(db,"events"),orderBy("date"),orderBy("start"));
  onSnapshot(q, snap => renderEvents(snap.docs.map(d => ({id:d.id,...d.data()}))), err => {
    console.error("Chyba onSnapshot events:",err);
    eventsEl.innerHTML = "<em>Nelze načíst akce.</em>";
  });
}
initReservations();
initEvents();
