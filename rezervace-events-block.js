// =========================================================
// rezervace-events-block.js
// Blokování rezervací podle Firestore kolekce `events`.
//
// Cíl:
// - Na vybraný den načíst akce (events) a jejich blokovací okna (blockStart–blockEnd)
// - Při pokusu o uložení rezervace zablokovat, pokud se čas překrývá s blokací
//
// Pozn.: Dráhy 1–4 blokujeme vždy všechny (zápas i turnaj). U vás vždy platí. ✅
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

// ---------- Načtené blokace pro aktuálně zvolený den ----------
let currentDate = null;     // "YYYY-MM-DD"
let blocks = [];            // [{blockStartMin, blockEndMin, label}]

// ---------- Načti events pro datum ----------
async function loadBlocksForDate(dateIso) {
  if (!dateIso) {
    currentDate = null;
    blocks = [];
    return;
  }

  currentDate = dateIso;
  blocks = [];

  try {
    const q = query(
      collection(db, "events"),
      where("date", "==", dateIso)
    );
    const snap = await getDocs(q);

    blocks = snap.docs.map(d => {
      const ev = d.data() || {};
      const bs = timeToMinutes(ev.blockStart);
      const be = timeToMinutes(ev.blockEnd);

      const label = ev.type === "match"
        ? `Zápas ${ev.team || ""}`.trim()
        : (ev.title || "Turnaj");

      return (bs !== null && be !== null)
        ? { blockStartMin: bs, blockEndMin: be, label }
        : null;
    }).filter(Boolean);
  } catch (e) {
    console.error("events load failed:", e);
    // Když nejde načíst, raději NEblokuj automaticky (aby se systém nezastavil),
    // ale error je v konzoli.
    blocks = [];
  }
}

// ---------- Zjisti, zda je vybraný čas blokovaný ----------
function isBlocked(dateIso, startHHMM, endHHMM) {
  if (!dateIso || dateIso !== currentDate) return { blocked: false };
  const s = timeToMinutes(startHHMM);
  const e = timeToMinutes(endHHMM);
  if (s === null || e === null) return { blocked: false };

  for (const b of blocks) {
    if (overlaps(s, e, b.blockStartMin, b.blockEndMin)) {
      return { blocked: true, label: b.label, from: b.blockStartMin, to: b.blockEndMin };
    }
  }
  return { blocked: false };
}

// =========================================================
// INTEGRACE do rezervace UI
//
// Protože nevidím přímo váš kód rezervací, děláme to robustně:
// - hledáme input pro datum a posloucháme jeho change
// - zachytíme submit formuláře (nebo klik na tlačítko "Rezervovat")
// - časy bereme z běžných polí start/end (pokud existují)
//
// Pokud se ID liší, upravíš jen 2 selektory níže.
// =========================================================

// 1) Selektory – uprav jen pokud máš jiné ID
const dateInput = document.querySelector("#date, #res-date, input[type='date']");

// start/end – typicky select nebo input (time)
const startInput = document.querySelector("#start, #res-start, #time-start, select[name='start'], input[name='start']");
const endInput   = document.querySelector("#end, #res-end, #time-end, select[name='end'], input[name='end']");

// zprávy pro uživatele (volitelné)
const msgBox = document.querySelector("#reservationMsg, #msg, #res-msg");

// 2) Při změně data načti events pro daný den
dateInput?.addEventListener("change", async () => {
  await loadBlocksForDate(dateInput.value);
  if (msgBox) msgBox.textContent = ""; // smaž zprávu
});

// 3) Zachyť odeslání rezervace
// - zkusíme najít formulář, nebo zachytíme click na tlačítko typu submit
const form = document.querySelector("form");

function blockWithMessage(label) {
  const text = `Tento termín je blokovaný: ${label}.`;
  if (msgBox) msgBox.textContent = text;
  else alert(text);
}

function checkAndBlock(evt) {
  // potřebujeme datum + start + end
  const dateIso = dateInput?.value || "";
  const start = startInput?.value || "";
  const end = endInput?.value || "";

  const r = isBlocked(dateIso, start, end);
