// =========================================================
// rezervace-events-block.js  (KROK 3)
// - načte events pro vybraný den
// - šediví a blokuje klik na sloty v #lanes (aby se neotevřel modál)
// - stále blokuje i submit (bezpečnostní pojistka)
// =========================================================

import { db } from "./firebase-config.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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
  return aStart < bEnd && bStart < aEnd;
}

// ---------- Stav načtených blokací pro aktuální den ----------
let currentDate = null; // "YYYY-MM-DD"
let blocks = [];        // [{ fromMin, toMin, label }]

// ---------- Vybraný slot (start + lane) ----------
let selected = { lane: null, start: null };

// ---------- DOM ----------
const dateInput = document.getElementById("date");
const lanesBox = document.getElementById("lanes");
const modalForm = document.getElementById("reservation-form");
const hoursSelect = document.getElementById("f-hours");
const modal = document.getElementById("res-form");

// ---------- UI hláška v modálu ----------
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

  const content = modal.querySelector(".modal-content") || modal;
  content.insertBefore(blockMsgEl, content.firstChild);

  return blockMsgEl;
}

function showBlocked(text) {
  const el = ensureBlockMsg();
  if (!el) { alert(text); return; }
  el.textContent = text;
  el.style.display = "block";
}

function hideBlocked() {
  if (!blockMsgEl) return;
  blockMsgEl.style.display = "none";
  blockMsgEl.textContent = "";
}

// ---------- CSS pro šedivé blokované sloty (injektujeme, ať nemusíš sahat do style.css) ----------
(function injectStyles(){
  const css = `
    .slot-blocked{
      opacity: 0.45 !important;
      filter: grayscale(0.7);
      pointer-events: auto; /* chceme zachytit klik a vypsat hlášku */
      cursor: not-allowed !important;
      outline: 2px solid rgba(255,59,48,0.35);
      border-radius: 10px;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

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
    blocks = [];
  }
}

// ---------- Najdi blokaci pro interval ----------
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
// ČTENÍ SLOTŮ V #lanes
// =========================================================

// Sloty jsou generované rezervace.js; budeme tolerantní:
// - pokusíme se najít HH:MM v textu slotu
// - nebo dataset start/time
function extractStartFromSlot(slotEl) {
  if (!slotEl) return "";
  const ds = slotEl.dataset?.start || slotEl.dataset?.time || "";
  if (ds && /^\d{1,2}:\d{2}$/.test(ds)) return ds;

  const m = (slotEl.textContent || "").match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : "";
}

// Blokace „na celé hodiny“ znamená:
// - slot start je blokovaný, pokud rezervace 1 hodina překrývá blokaci
// (minimální rezervace je u vás 1h, takže to stačí)
function isStartBlockedByAnyBlock(startHHMM) {
  const s = timeToMinutes(startHHMM);
  if (s === null) return null;

  // uvažujeme minimální délku 60 minut (slot start)
  const e = s + 60;

  for (const b of blocks) {
    if (overlaps(s, e, b.fromMin, b.toMin)) return b;
  }
  return null;
}

// Označí sloty jako blokované (šedé + class)
function applyBlockingToSlots() {
  if (!lanesBox || !currentDate) return;

  // Vybereme kandidáty: nejčastěji jsou to tlačítka slotů nebo divy uvnitř #lanes
  // Nebudeme brát úplně všechno, filtrujeme jen prvky, které obsahují čas.
  const candidates = lanesBox.querySelectorAll("button, [role='button'], div");

  candidates.forEach(el => {
