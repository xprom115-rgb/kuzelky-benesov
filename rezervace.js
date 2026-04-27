// ============================================================
// rezervace.js (vyčištěná a okomentovaná verze)
//
// Závislosti:
// - config.js           (export BASE_URL)
// - firebase-config.js  (export db)
// - qrcode-svg          (globální window.QRCode)
// - Firestore kolekce: reservations
//
// Co skript dělá:
// 1) Vykreslí hodinové sloty pro dráhy 1–4 dle vybraného data (#date) do #lanes
// 2) Po kliknutí na volný slot otevře modál (#res-form) a uloží volbu do proměnných
// 3) Po potvrzení uloží rezervaci do Firestore (addDoc) + ukáže kód a QR pro storno stránku
// 4) Před uložením znovu načte obsazenost a ověří kolizi (ochrana proti závodům)
// ============================================================

import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ============================================================
// Nastavení provozu a slotů
// ============================================================

const LANES = [1, 2, 3, 4];
const START_HOUR = 8;
const END_HOUR = 21; // poslední slot začíná 20:00 a končí 21:00 (END_HOUR je exkluzivní)

// ============================================================
// Pomocné funkce: čas a formát
// ============================================================

function pad2(n) {
  return String(n).padStart(2, "0");
}

function hourToTime(h) {
  return `${pad2(h)}:00`;
}

function timeToMinutes(hhmm) {
  const m = (hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesToTime(mins) {
  // normalizace do 0..1439 (jen pro jistotu)
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function generateHourlySlots() {
  // vrací např. ["08:00", "09:00", ..., "20:00"]
  const slots = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    slots.push(hourToTime(h));
  }
  return slots;
}

// ============================================================
// Generátor storno kódu (bez podobných znaků O/0/I/1)
// ============================================================

function generateCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < len; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================
// QR kód (qrcode-svg) – vkládá SVG do cílového prvku
// ============================================================

function renderQR(targetEl, text) {
  targetEl.innerHTML = "";

  try {
    const QR = window.QRCode;
    if (!QR) throw new Error("QRCode knihovna není načtena.");

    const svg = new QR({
      content: text,
      width: 200,
      height: 200,
      padding: 1
    }).svg();

    targetEl.innerHTML = svg;
  } catch (e) {
    console.warn("QR se nepodařilo vygenerovat:", e);
    targetEl.innerHTML = `<small>QR kód se nepodařilo vytvořit. Otevřete storno ručně: <strong>${text}</strong></small>`;
  }
}

// ============================================================
// Firestore: načtení rezervací pro daný den
// ============================================================

async function getReservationsForDate(date) {
  const q = query(collection(db, "reservations"), where("date", "==", date));
  const snap = await getDocs(q);

  const res = [];
  snap.forEach((d) => res.push(d.data()));
  return res;
}

// reserved[lane] = [{start,end}, ...]
async function getReservedSlots(date) {
  const rows = await getReservationsForDate(date);
  const reserved = {};

  for (const r of rows) {
    const lane = Number(r.lane);
    if (!reserved[lane]) reserved[lane] = [];
    reserved[lane].push({ start: r.start, end: r.end });
  }
  return reserved;
}

// ============================================================
// Kolize: ověř, že [start, end) nezasahuje do žádné rezervace na dráze
// ============================================================

function isSlotFree(reserved, lane, start, hours) {
  const sMin = timeToMinutes(start);
  if (sMin === null) return false;

  const eMin = sMin + (hours * 60);

  // mimo pracovní dobu – bezpečnostní pojistka
  const dayStartMin = START_HOUR * 60;
  const dayEndMin = END_HOUR * 60;
  if (sMin < dayStartMin || eMin > dayEndMin) return false;

  if (!reserved[lane] || reserved[lane].length === 0) return true;

  for (const r of reserved[lane]) {
    const rs = timeToMinutes(r.start);
    const re = timeToMinutes(r.end);
    if (rs === null || re === null) continue;

    // překryv intervalů [sMin,eMin) a [rs,re)
    const overlap = (sMin < re) && (rs < eMin);
    if (overlap) return false;
  }

  return true;
}

// ============================================================
// Firestore: uložení rezervace
// - id = storno kód (ukládá se do pole "id")
// ============================================================

async function saveReservation({ date, lane, start, end, name, note }) {
  const code = generateCode(6);

  const data = {
    id: code,
    date,
    lane,
    start,
    end,
    name,
    note: note || "",
    createdAt: Timestamp.now()
  };

  await addDoc(collection(db, "reservations"), data);
  return data;
}

// ============================================================
// UI: modál – ukládáme zvolený slot do proměnných
// ============================================================

let selDate = null;
let selLane = null;
let selStart = null;

function openReservationForm(date, lane, start) {
  selDate = date;
  selLane = lane;
  selStart = start;

  // vyčisti inputy
  document.getElementById("f-name").value = "";
  document.getElementById("f-hours").value = "1";
  document.getElementById("f-note").value = "";

  // zobraz modál
  document.getElementById("res-form").hidden = false;
}

function closeReservationForm() {
  document.getElementById("res-form").hidden = true;
}

// ============================================================
// UI: výsledek (kód + kopírovat + QR)
// ============================================================

function showReservationResult(r) {
  const box = document.getElementById("reservation-result");
  const codeEl = document.getElementById("code");
  const qrDiv = document.getElementById("qrcode");

  // kód jako badge + tlačítko kopírovat
  codeEl.innerHTML = `
    <span style="display:inline-block;padding:8px 14px;border-radius:10px;background:#1e235c;color:#ffd700;font-weight:700;letter-spacing:2px;">
      ${r.id}
    </span>
    <button id="btnCopyCode"
      style="margin-left:8px;padding:8px 10px;border-radius:8px;border:0;background:#ececec;cursor:pointer;">
      Kopírovat
    </button>
  `;

  document.getElementById("btnCopyCode").onclick = async () => {
    try {
      await navigator.clipboard.writeText(r.id);
      alert("Kód zkopírován.");
    } catch {
      alert("Kód si prosím zkopírujte ručně.");
    }
  };

  // QR má vést na storno stránku (kód se zadává ručně – dle tvého zadání)
  const stornoUrl = `${BASE_URL}rezervace-storno.html`;
  renderQR(qrDiv, stornoUrl);

  box.style.display = "block";
}

// ============================================================
// Kliknutí na slot -> otevřít formulář
// ============================================================

function handleSlotClick(date, lane, start) {
  openReservationForm(date, lane, start);
}

// ============================================================
// Vykreslení slotů pro vybraný den
// ============================================================

async function renderSlots(date) {
  const lanesDiv = document.getElementById("lanes");
  lanesDiv.innerHTML = "";

  if (!date) return;

  // načti obsazenost
  const reserved = await getReservedSlots(date);
  const slots = generateHourlySlots();

  for (const lane of LANES) {
    const laneBox = document.createElement("div");
    laneBox.className = "lane-box";

    const title = document.createElement("h3");
    title.textContent = `Dráha ${lane}`;
    laneBox.appendChild(title);

    for (const start of slots) {
      const btn = document.createElement("button");
      btn.textContent = start;
      btn.className = "slot-btn";

      // DŮLEŽITÉ: data-* pro blokování událostmi (rezervace-events-block.js)
      btn.dataset.start = start;
      btn.dataset.lane = String(lane);

      // obsazený pokud spadá do intervalu některé rezervace
      let busy = false;

      if (reserved[lane]) {
        const h = parseInt(start.split(":")[0], 10);
        for (const r of reserved[lane]) {
          const rs = parseInt(r.start.split(":")[0], 10);
          const re = parseInt(r.end.split(":")[0], 10);
          if (h >= rs && h < re) { busy = true; break; }
        }
      }

      if (busy) {
        btn.classList.add("busy");
        btn.disabled = true;
      } else {
        btn.classList.add("free");
        btn.addEventListener("click", () => handleSlotClick(date, lane, start));
      }

      laneBox.appendChild(btn);
    }

    lanesDiv.appendChild(laneBox);
  }
}

// ============================================================
// Eventy stránky
// ============================================================

// změna datumu -> překreslit sloty
document.getElementById("date").addEventListener("change", (e) => {
  const date = e.target.value;
  renderSlots(date);
});

// odeslání formuláře v modálu
document.getElementById("reservation-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("f-name").value.trim();
  const hours = parseInt(document.getElementById("f-hours").value, 10);
  const note = document.getElementById("f-note").value.trim();

  if (!name || name.length < 2) {
    alert("Zadejte prosím jméno.");
    return;
  }
  if (![1, 2, 3].includes(hours)) {
    alert("Počet hodin musí být 1–3.");
    return;
  }

  // ochrana – těsně před uložením znovu načti obsazenost
  const reserved = await getReservedSlots(selDate);

  if (!isSlotFree(reserved, selLane, selStart, hours)) {
    alert("Vybraný termín je už obsazený.");
    closeReservationForm();
    await renderSlots(selDate);
    return;
  }

  // spočti end
  const sMin = timeToMinutes(selStart);
  const end = minutesToTime(sMin + hours * 60);

  try {
    const r = await saveReservation({
      date: selDate,
      lane: selLane,
      start: selStart,
      end,
      name,
      note
    });

    closeReservationForm();
    showReservationResult(r);

    // refresh slotů pro vybraný den
    await renderSlots(selDate);

  } catch (err) {
    console.error(err);
    alert("Nepodařilo se uložit rezervaci. Zkuste to prosím znovu.");
  }
});

// tlačítko Zpět v modálu
document.getElementById("f-cancel").addEventListener("click", closeReservationForm);

// auto-start (kdyby input měl value)
window.addEventListener("load", () => {
  const dateInput = document.getElementById("date");
  if (dateInput.value) {
    renderSlots(dateInput.value);
  }
});
