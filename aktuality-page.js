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
