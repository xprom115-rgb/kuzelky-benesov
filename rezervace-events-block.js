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
      // Začátek blokace převedeme běžně na minuty.
const from = timeToMinutes(ev.blockStart);
      // Konec 00:00 znamená půlnoc na konci dne, tedy 24:00.

    // Proto ho musíme převést na 1440 minut, nikoliv na 0 minut.
const to = ev.blockEnd === "00:00"
? 24 * 60
: timeToMinutes(ev.blockEnd);

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
    const start = extractStartFromSlot(el);
    if (!start) return;

    const hit = isStartBlockedByAnyBlock(start);

    // Odznačení
    el.classList.remove("slot-blocked");
    el.removeAttribute("aria-disabled");
    el.removeAttribute("data-block-label");

    if (hit) {
      el.classList.add("slot-blocked");
      el.setAttribute("aria-disabled", "true");
      el.setAttribute("data-block-label", hit.label);
    }
  });
}

// =========================================================
// EVENTY
// =========================================================

// 1) změna data => načti blokace a po načtení zkus označit sloty
dateInput?.addEventListener("change", async () => {
  selected = { lane: null, start: null };
  hideBlocked();

  await loadBlocksForDate(dateInput.value);

  // sloty se možná renderují později, proto dáme malý odklad
  setTimeout(applyBlockingToSlots, 50);
});

// 2) MutationObserver: když rezervace.js přerenderuje #lanes, znovu aplikuj blokaci
if (lanesBox) {
  const obs = new MutationObserver(() => {
    // aplikuj až po DOM změně
    applyBlockingToSlots();
  });
  obs.observe(lanesBox, { childList: true, subtree: true });
}

// 3) Klik na slot: pokud je blokovaný, zastav klik a napiš hlášku (modál se neotevře)
lanesBox?.addEventListener("click", async (evt) => {
  hideBlocked();

  const dateIso = dateInput?.value || "";
  if (!dateIso) return;

  // když jsou blocks prázdné/neaktuální, načti
  if (currentDate !== dateIso) {
    await loadBlocksForDate(dateIso);
    applyBlockingToSlots();
  }

  const target = evt.target instanceof HTMLElement ? evt.target : null;
  if (!target) return;

  const slotEl = target.closest(".slot-blocked");
  if (slotEl) {
    evt.preventDefault();
    evt.stopPropagation();

    const label = slotEl.getAttribute("data-block-label") || "Akce";
    showBlocked(`Termín je blokovaný (${label}) – nelze vybrat.`);
    return false;
  }

  // pokud není blokovaný, uložíme vybraný start pro kontrolu při submitu
  const maybeSlot = target.closest("button, [role='button'], div");
  if (maybeSlot) {
    const start = extractStartFromSlot(maybeSlot);
    if (start) selected.start = start;
  }
}, true); // capture=true, ať to chytíme dřív než rezervace.js

// 4) Submit modálu: bezpečnostní pojistka – i kdyby někdo prošel klikem, nepustíme uložení
modalForm?.addEventListener("submit", async (evt) => {
  hideBlocked();

  const dateIso = dateInput?.value || "";
  if (!dateIso) return;

  if (currentDate !== dateIso) await loadBlocksForDate(dateIso);

  const start = selected.start;
  if (!start) return; // když nevíme start, necháme to na rezervace.js

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

// 5) start stránky: když je datum už vyplněné, načti blokace a aplikuj na sloty
if (dateInput?.value) {
  loadBlocksForDate(dateInput.value).then(() => setTimeout(applyBlockingToSlots, 50));
}
