// ============================================================
// rezervace.js – více drah, libovolný interval 08:00–21:00
// Jedna rezervace = jeden dokument a jeden storno kód.
// Nové pole lanes obsahuje všechny vybrané dráhy.
// Pole lane zůstává kvůli zpětné kompatibilitě administrace.
// ============================================================
import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const LANES = [1, 2, 3, 4];
const START_HOUR = 8;
const END_HOUR = 21;
const STEP_MINUTES = 60; // změňte na 30, pokud později chcete půlhodiny

const pad2 = n => String(n).padStart(2, "0");
const minutesToTime = mins => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
function timeToMinutes(value) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function generateTimes(includeEnd = false) {
  const result = [];
  const limit = END_HOUR * 60 + (includeEnd ? 1 : 0);
  for (let m = START_HOUR * 60; m < limit; m += STEP_MINUTES) result.push(minutesToTime(m));
  return result;
}
function generateCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  crypto.getRandomValues(new Uint32Array(len)).forEach(n => code += chars[n % chars.length]);
  return code;
}
function lanesOf(r) {
  const values = Array.isArray(r.lanes) ? r.lanes : [r.lane];
  return [...new Set(values.map(Number).filter(n => LANES.includes(n)))];
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function renderQR(target, text) {
  target.innerHTML = "";
  try {
    if (!window.QRCode) throw new Error("QRCode knihovna není načtena.");
    target.innerHTML = new window.QRCode({ content: text, width: 200, height: 200, padding: 1 }).svg();
  } catch (e) {
    console.warn(e);
    target.textContent = `Storno otevřete na adrese: ${text}`;
  }
}
async function reservationsForDate(date) {
  const snap = await getDocs(query(collection(db, "reservations"), where("date", "==", date)));
  return snap.docs.map(d => ({ docId: d.id, ...d.data() }));
}
function conflictingLanes(rows, lanes, start, end) {
  const s = timeToMinutes(start), e = timeToMinutes(end);
  if (s === null || e === null) return lanes.slice();
  return lanes.filter(lane => rows.some(r => {
    if (!lanesOf(r).includes(lane)) return false;
    const rs = timeToMinutes(r.start), re = timeToMinutes(r.end);
    return rs !== null && re !== null && overlaps(s, e, rs, re);
  }));
}
async function saveReservation({ date, lanes, start, end, name, note }) {
  const data = {
    id: generateCode(), date, lanes,
    lane: lanes[0], // kompatibilita se staršími částmi webu
    start, end, name, note: note || "", createdAt: Timestamp.now()
  };
  await addDoc(collection(db, "reservations"), data);
  return data;
}

let selectedDate = null;
let selectedStart = null;
let clickedLane = null;
const modal = document.getElementById("res-form");
const startSelect = document.getElementById("f-start");
const endSelect = document.getElementById("f-end");
const laneChecks = [...document.querySelectorAll(".f-lane")];
const allLanesCheck = document.getElementById("f-all-lanes");

function fillSelect(select, values, selected) {
  select.innerHTML = values.map(v => `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`).join("");
}
function refreshEndTimes() {
  const startMin = timeToMinutes(startSelect.value);
  const ends = generateTimes(true).filter(t => timeToMinutes(t) > startMin);
  const previous = endSelect.value;
  fillSelect(endSelect, ends, ends.includes(previous) ? previous : ends[0]);
}
function syncAllLanes() {
  allLanesCheck.checked = laneChecks.every(c => c.checked);
  allLanesCheck.indeterminate = laneChecks.some(c => c.checked) && !allLanesCheck.checked;
}
function selectedLanes() {
  return laneChecks.filter(c => c.checked).map(c => Number(c.value));
}
function openReservationForm(date, lane, start) {
  selectedDate = date; clickedLane = lane; selectedStart = start;
  document.getElementById("f-name").value = "";
  document.getElementById("f-note").value = "";
  laneChecks.forEach(c => c.checked = Number(c.value) === lane);
  syncAllLanes();
  fillSelect(startSelect, generateTimes(false), start);
  refreshEndTimes();
  modal.hidden = false;
}
function closeReservationForm() { modal.hidden = true; }
function showReservationResult(r) {
  document.getElementById("reservation-summary").textContent = `Dráhy ${r.lanes.join(", ")} • ${r.date} • ${r.start}–${r.end}`;
  const codeEl = document.getElementById("code");
  codeEl.innerHTML = `<span class="reservation-code">${r.id}</span><button id="btnCopyCode" class="btn-soft" type="button">Kopírovat</button>`;
  document.getElementById("btnCopyCode").onclick = async () => {
    try { await navigator.clipboard.writeText(r.id); alert("Kód zkopírován."); }
    catch { alert("Kód si prosím zkopírujte ručně."); }
  };
  renderQR(document.getElementById("qrcode"), `${BASE_URL}rezervace-storno.html`);
  document.getElementById("reservation-result").style.display = "block";
}
async function renderSlots(date) {
  const box = document.getElementById("lanes");
  box.innerHTML = "";
  if (!date) return;
  const rows = await reservationsForDate(date);
  for (const lane of LANES) {
    const laneBox = document.createElement("div"); laneBox.className = "lane-box";
    laneBox.innerHTML = `<h3>Dráha ${lane}</h3>`;
    for (const start of generateTimes(false)) {
      const end = minutesToTime(timeToMinutes(start) + STEP_MINUTES);
      const busy = conflictingLanes(rows, [lane], start, end).length > 0;
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = start; btn.className = `slot-btn ${busy ? "busy" : "free"}`;
      btn.dataset.start = start; btn.dataset.lane = String(lane);
      btn.disabled = busy;
      if (!busy) btn.addEventListener("click", () => openReservationForm(date, lane, start));
      laneBox.appendChild(btn);
    }
    box.appendChild(laneBox);
  }
}

allLanesCheck.addEventListener("change", () => laneChecks.forEach(c => c.checked = allLanesCheck.checked));
laneChecks.forEach(c => c.addEventListener("change", syncAllLanes));
startSelect.addEventListener("change", () => { selectedStart = startSelect.value; refreshEndTimes(); });
document.getElementById("date").addEventListener("change", e => renderSlots(e.target.value));
document.getElementById("f-cancel").addEventListener("click", closeReservationForm);
document.getElementById("reservation-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("f-name").value.trim();
  const note = document.getElementById("f-note").value.trim();
  const lanes = selectedLanes();
  const start = startSelect.value, end = endSelect.value;
  const s = timeToMinutes(start), en = timeToMinutes(end);
  if (name.length < 2) return alert("Zadejte prosím jméno.");
  if (!lanes.length) return alert("Vyberte alespoň jednu dráhu.");
  if (s < START_HOUR * 60 || en > END_HOUR * 60 || en <= s) return alert("Čas musí být v rozsahu 08:00–21:00 a konec musí být později než začátek.");
  const rows = await reservationsForDate(selectedDate);
  const conflicts = conflictingLanes(rows, lanes, start, end);
  if (conflicts.length) {
    alert(`Rezervaci nelze uložit. V tomto čase jsou obsazené dráhy: ${conflicts.join(", ")}.`);
    await renderSlots(selectedDate); return;
  }
  try {
    const r = await saveReservation({ date: selectedDate, lanes, start, end, name, note });
    closeReservationForm(); showReservationResult(r); await renderSlots(selectedDate);
  } catch (err) { console.error(err); alert("Nepodařilo se uložit rezervaci. Zkuste to prosím znovu."); }
});
window.addEventListener("load", () => {
  const input = document.getElementById("date");
  const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  input.min = local;
  if (input.value) renderSlots(input.value);
});
