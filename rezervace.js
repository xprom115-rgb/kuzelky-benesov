// rezervace.js (finální)
// ------------------------------------------------------------
// Závislosti:
// - config.js (export BASE_URL)
// - firebase-config.js (export db)
// - qrcode-svg knihovna (globální QRCode)
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// Nastavení slotů
// ------------------------------------------------------------
const START_HOUR = 8;
const END_HOUR = 21; // poslední slot začíná 20:00, končí 21:00

function pad2(n) {
  return String(n).padStart(2, "0");
}

function hourToTime(h) {
  return `${pad2(h)}:00`;
}

function generateHourlySlots() {
  const slots = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    slots.push(hourToTime(h));
  }
  return slots;
}

// ------------------------------------------------------------
// Generátor kódu (bez podobných znaků)
// ------------------------------------------------------------
function generateCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < len; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ------------------------------------------------------------
// QR kód (qrcode-svg)
// ------------------------------------------------------------
function renderQR(targetEl, text) {
  targetEl.innerHTML = "";

  try {
    // qrcode-svg dává globální QRCode
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

// ------------------------------------------------------------
// Načtení rezervací pro daný den (a volitelně dráhu)
// ------------------------------------------------------------
async function getReservationsForDate(date) {
  const q = query(collection(db, "reservations"), where("date", "==", date));
  const snap = await getDocs(q);

  const res = [];
  snap.forEach((d) => res.push(d.data()));
  return res;
}

// Sestavení mapy obsazenosti: reserved[lane] = [{start,end}, ...]
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

// ------------------------------------------------------------
// Kontrola kolize
// start "10:00", hours=2 => end "12:00"
// ------------------------------------------------------------
function isSlotFree(reserved, lane, start, hours) {
  const sH = parseInt(start.split(":")[0], 10);
  const eH = sH + hours;

  if (!reserved[lane]) return true;

  for (const r of reserved[lane]) {
    const rs = parseInt(r.start.split(":")[0], 10);
    const re = parseInt(r.end.split(":")[0], 10);

    // pokud se překrývá:
    if (!(eH <= rs || sH >= re)) {
      return false;
    }
  }
  return true;
}

// ------------------------------------------------------------
// Uložení rezervace do Firestore
// (id = storno kód, ukládá se i jako pole "id")
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// UI: modál – ukládáme zvolený slot do proměnných
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// Zobrazení výsledku (kód + kopírovat + QR)
// ------------------------------------------------------------
function showReservationResult(r) {
  const box = document.getElementById("reservation-result");
  const codeEl = document.getElementById("code");
  const qrDiv = document.getElementById("qrcode");

  // kód vždy zobrazíme jako badge + kopírovat
  codeEl.innerHTML = `
    <span style="display:inline-block;padding:8px 14px;border-radius:10px;background:#1e235c;color:#ffd700;font-weight:700;letter-spacing:2px;">
      ${r.id}
    </span>
    <button id="btnCopyCode"
      style="margin-left:8px;padding:8px 10px;border-radius:8px;border:0;background:#ececec;cursor:pointer;">
      Kopírovat
    </button>
  `;

  // kopírování do schránky
  document.getElementById("btnCopyCode").onclick = async () => {
    try {
      await navigator.clipboard.writeText(r.id);
      alert("Kód zkopírován.");
    } catch {
      alert("Kód si prosím zkopírujte ručně.");
    }
  };

  // QR
 const stornoUrl = `${BASE_URL}rezervace-storno.html`;
renderQR(qrDiv, stornoUrl);
``

  // zobraz box
  box.style.display = "block";
}

// ------------------------------------------------------------
// Kliknutí na slot -> otevřít formulář
// ------------------------------------------------------------
function handleSlotClick(date, lane, start) {
  openReservationForm(date, lane, start);
}

// ------------------------------------------------------------
// Vykreslení slotů pro vybraný den
// ------------------------------------------------------------
async function renderSlots(date) {
  const lanesDiv = document.getElementById("lanes");
  lanesDiv.innerHTML = "";

  if (!date) return;

  // načti obsazenost
  const reserved = await getReservedSlots(date);
  const slots = generateHourlySlots();

  for (let lane = 1; lane <= 4; lane++) {
    const laneBox = document.createElement("div");
    laneBox.className = "lane-box";

    const title = document.createElement("h3");
    title.textContent = `Dráha ${lane}`;
    laneBox.appendChild(title);

    for (const start of slots) {
      const btn = document.createElement("button");
      btn.textContent = start;
      btn.className = "slot-btn";

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

// ------------------------------------------------------------
// Eventy
// ------------------------------------------------------------

// změna datumu
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

  // ochrana – znovu načti obsazenost těsně před uložením
  const reserved = await getReservedSlots(selDate);

  if (!isSlotFree(reserved, selLane, selStart, hours)) {
    alert("Vybraný termín je už obsazený.");
    closeReservationForm();
    renderSlots(selDate);
    return;
  }

  // spočti end
  const sH = parseInt(selStart.split(":")[0], 10);
  const end = `${pad2(sH + hours)}:00`;

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
