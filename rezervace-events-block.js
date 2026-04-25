// =========================================================
// rezervace-events-block.js
//
// CO TO DĚLÁ:
// - Na vybraný den načte z Firestore kolekce `events` všechny akce (zápasy/turnaje).
// - Každá akce má uložené blockStart/blockEnd (zaokrouhlené na hodinu).
// - Při pokusu o rezervaci zablokuje odeslání, pokud čas rezervace spadá do blokace.
// - Blokujeme VŽDY všechny dráhy 1–4 (turnaj i zápas).
//
// POZNÁMKA:
// - Neřeší vizuální disable slotů v UI (to může být další krok).
// - Toto je "bezpečný" blok: rezervace se prostě neuloží.
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
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  // překryv intervalů [aStart,aEnd) a [bStart,bEnd)
  return aStart < bEnd && bStart < aEnd;
}

// ---------- Stav načtených blokací pro aktuální den ----------
let currentDate = null; // "YYYY-MM-DD"
let blocks = [];        // [{ fromMin, toMin, label }]

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

      // potřebujeme blockStart/blockEnd
      if (from === null || to === null) return null;
      return { fromMin: from, toMin: to, label };
    }).filter(Boolean);

  } catch (e) {
    console.error("events load failed:", e);
    // Když nejde načíst, raději neblokujeme (aby se systém úplně nezastavil),
    // ale chyba je v konzoli.
    blocks = [];
  }
}

// ---------- Zjisti, zda je rezervace blokovaná ----------
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
// INTEGRACE DO rezervační stránky
// - protože neznáme přesně tvé ID, používáme tolerantní selektory
// - pokud se netrefí, řekni a doladíme (krokově)
// =========================================================

// datum (většinou jediný input type=date na stránce)
const dateInput =
  document.querySelector("#date, #res-date, #reservation-date, input[type='date']");

// start/end (select nebo input)
const startInput =
  document.querySelector("#start, #res-start, #time-start, select[name='start'], input[name='start']");
const endInput =
  document.querySelector("#end, #res-end, #time-end, select[name='end'], input[name='end']");

// místo pro hlášku (když existuje)
const msgBox =
  document.querySelector("#reservationMsg, #msg, #res-msg");

// nejčastěji je rezervace přes form submit
const form = document.querySelector("form");

// fallback: tlačítko rezervovat
function findReserveButton() {
  return document.querySelector("#reserveBtn, button[type='submit'], button");
}
const reserveBtn = findReserveButton();

function showBlockedMessage(label) {
  const text = `Termín je blokovaný (${label}) – nelze rezervovat.`;
  if (msgBox) msgBox.textContent = text;
  else alert(text);
}

// 1) Po změně data načti blokace
dateInput?.addEventListener("change", async () => {
  await loadBlocksForDate(dateInput.value);
  if (msgBox) msgBox.textContent = "";
});

// 2) Před odesláním rezervace zkontroluj blokaci
function checkAndBlock(evt) {
  const dateIso = dateInput?.value || "";
  const start = startInput?.value || "";
  const end = endInput?.value || "";

  const hit = getBlockHit(dateIso, start, end);
  if (hit) {
    evt.preventDefault();
    evt.stopPropagation();
    showBlockedMessage(hit.label);
    return false;
  }
  return true;
}

if (form) {
  // zachytíme submit formu (nejjistější)
  form.addEventListener("submit", (evt) => {
    checkAndBlock(evt);
  }, true);
} else {
  // fallback: zachytit click na "rezervovat"
  reserveBtn?.addEventListener("click", (evt) => {
    checkAndBlock(evt);
  }, true);
}

// 3) Načti blokace hned při startu, pokud už je datum vyplněné
if (dateInput?.value) {
  loadBlocksForDate(dateInput.value);
}
