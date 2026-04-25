// =========================================================
// rezervace-events-block.js  (KROK 2)
// Blokování rezervací podle Firestore kolekce `events`.
//
// Jak to funguje u vás:
// - datum je input #date
// - sloty/dráhy se generují do #lanes a volba času je klikem na slot
// - po kliknutí se otevře modál #res-form a odešle se form #reservation-form
// - délka rezervace je #f-hours (1–3 hodiny)
//
// Co děláme:
// 1) Na vybraný den načteme events: where(date == vybraný den)
// 2) Z každé akce vezmeme blockStart/blockEnd (už zaokrouhlené na celé hodiny)
// 3) Po kliknutí na slot si uložíme vybraný start čas (HH:MM) a dráhu
// 4) Při submitu modálu spočítáme end = start + hours a zkontrolujeme překryv
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ---------- Helpery pro čas ----------
function timeToMinutes(hhmm) {
  const m = (hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return h * 60 + mi;
}

function minutesToTime(mins) {
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  // překryv [aStart,aEnd) a [bStart,bEnd)
  return aStart < bEnd && bStart < aEnd;
}

// ---------- Načtené blokace pro aktuální den ----------
let currentDate = null; // "YYYY-MM-DD"
let blocks = [];        // [{ fromMin, toMin, label }]

// ---------- Vybraný slot (start + lane) ----------
let selected = {
  lane: null,
  start: null // "HH:MM"
};

// ---------- Načíst events pro datum ----------
async function loadBlocksForDate(dateIso) {
  currentDate = dateIso || null;
  blocks = [];

  if (!dateIso) return;

  try {
    const q = query(collection(db, "events"), where("date", "==", dateIso));
    const snap = await getDocs(q);

    blocks = snap.docs.map(d => {
      const ev = d.data() || {};
      const from = timeToMinutes(ev.blockStart);
      const to = timeToMinutes(ev.blockEnd);

      const label = ev.type === "match"
        ? `Zápas ${ev.team || ""}`.trim()
        : (ev.title || "Turnaj");

      if (from === null || to === null) return null;
      return { fromMin: from, toMin: to, label };
    }).filter(Boolean);

  } catch (e) {
    console.error("events load failed:", e);
    // když nejde načíst, raději neblokujeme a jen logujeme do konzole
    blocks = [];
  }
}

// ---------- Najdi blokaci pro interval (vrací objekt nebo null) ----------
function getBlockHit(dateIso, startHHMM, endHHMM) {
  if (!dateIso || dateIso !== currentDate) return null;

  const s = timeToMinutes(startHHMM);
  const e = timeToMinutes(endHHMM);
  if (s === null || e === null) return null;

  for (const b of blocks) {
    if (overlaps(s, e, b.fromMin, b.toMin)) return b;
  }
  return null;
}

// =========================================================
// INTEGRACE DO DOM
// =========================================================

const dateInput = document.getElementById("date");
const lanesBox = document.getElementById("lanes");

const modalForm = document.getElementById("reservation-form");
const hoursSelect = document.getElementById("f-hours");

// místo pro hlášky (vytvoříme si vlastní, aby to bylo vždy vidět)
const modal = document.getElementById("res-form");
let blockMsgEl = null;

function ensureBlockMsg() {
  if (!modal) return null;
  if (blockMsgEl) return blockMsgEl;

  blockMsgEl = document.createElement("div");
  blockMsgEl.style.margin = "10px 0";
  blockMsgEl.style.padding = "10px 12px";
  blockMsgEl.style.borderRadius = "12px";
  blockMsgEl.style.border = "2px solid #ff3b30";
  blockMsgEl.style.background = "rgba(255, 215, 0, 0.15)";
  blockMsgEl.style.color = "#ffd700";
  blockMsgEl.style.fontWeight = "700";
  blockMsgEl.style.display = "none";

  // vložíme do modálu nahoru (do content)
  const content = modal.querySelector(".modal-content") || modal;
  content.insertBefore(blockMsgEl, content.firstChild);

  return blockMsgEl;
}

function showBlocked(text) {
  const el = ensureBlockMsg();
  if (!el) {
    alert(text);
    return;
  }
  el.textContent = text;
  el.style.display = "block";
}

function hideBlocked() {
  if (!blockMsgEl) return;
  blockMsgEl.style.display = "none";
  blockMsgEl.textContent = "";
}

// 1) při změně data načti blokace
dateInput?.addEventListener("change", async () => {
  selected = { lane: null, start: null };
  hideBlocked();
  await loadBlocksForDate(dateInput.value);
});

// 2) zachyť klik na slot v #lanes a zkus vyčíst start čas + dráhu
// Pozn.: nevíme přesnou strukturu slotů, takže hledáme HH:MM v textu nebo dataset.
lanesBox?.addEventListener("click", async (evt) => {
  hideBlocked();

  const dateIso = dateInput?.value || "";
  if (!dateIso) return;

  // když se ještě nenačetly blokace pro tento den, načti je
  if (currentDate !== dateIso) await loadBlocksForDate(dateIso);

  const target = evt.target instanceof HTMLElement ? evt.target : null;
  if (!target) return;

  // najdi prvek slotu (může to být button/div)
  const slotEl = target.closest("[data-start],[data-time],button,div");
  if (!slotEl) return;

  // pokus 1: dataset start
  let start = slotEl.dataset.start || slotEl.dataset.time || "";

  // pokus 2: vytáhni HH:MM z textu
  if (!start) {
    const m = (slotEl.textContent || "").match(/(\d{1,2}:\d{2})/);
    if (m) start = m[1];
  }

  // dráha – pokus: dataset lane
  let lane = slotEl.dataset.lane || "";

  // pokus 2: najdi "Dráha X" v okolním textu
  if (!lane) {
    const t = (slotEl.closest("#lanes")?.textContent || "");
    // nehledáme globálně, to by bralo i jiné dráhy; pokusíme se přes rodiče
    const parentText = (slotEl.parentElement?.textContent || "");
    const mm = parentText.match(/Dráha\s*(\d)/i);
    if (mm) lane = mm[1];
  }

  // uložíme vybraný start (dráha není pro blokaci potřeba, ale ukládáme ji pro debug)
  if (start) {
    selected.start = start;
    selected.lane = lane ? Number(lane) : null;
  }
});

// 3) při odeslání modálu zkontroluj blokaci
modalForm?.addEventListener("submit", async (evt) => {
  hideBlocked();

  const dateIso = dateInput?.value || "";
  if (!dateIso) return;

  // pokud blokace ještě není načtená, načti
  if (currentDate !== dateIso) await loadBlocksForDate(dateIso);

  const start = selected.start;
  if (!start) {
    // pokud nemáme start, neblokujeme (necháme rezervace.js aby si to řešil)
    return;
  }

  const hours = Number(hoursSelect?.value || "1");
  const sMin = timeToMinutes(start);
  if (sMin === null) return;

  const end = minutesToTime(sMin + (hours * 60));

  const hit = getBlockHit(dateIso, start, end);
  if (hit) {
    evt.preventDefault();
    evt.stopPropagation();
    showBlocked(`Termín je blokovaný (${hit.label}) – nelze rezervovat. Blokace: ${minutesToTime(hit.fromMin)}–${minutesToTime(hit.toMin)}.`);
    return false;
  }

  return true;
}, true);

// 4) při startu stránky – když už je datum vyplněné, načti blokace
if (dateInput?.value) {
  loadBlocksForDate(dateInput.value);
}
