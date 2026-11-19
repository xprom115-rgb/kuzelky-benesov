// Rozpis zapasu Habadury. Verejne cteni, editace pouze v UI tymu Benesov D.
import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const COLLECTION = "habaduraSchedules";
const LEAGUE = 1;
const FIXED_TIMES = ["17:30", "19:00", "20:30"];
const LANES = 4;
const ALLOWED_TEAM_NAME = "Benešov D";

const scheduleBox = document.querySelector(".schedule-box");
const publicTitle = scheduleBox?.querySelector("h3");
const publicTable = scheduleBox?.querySelector("table");
const publicBody = publicTable?.querySelector("tbody");
const editor = document.getElementById("scheduleEditorBenesovD");
const roundSelect = document.getElementById("schedule-round-select");
const matchCountInput = document.getElementById("schedule-match-count");
const editorRows = document.getElementById("schedule-editor-rows");
const saveButton = document.getElementById("schedule-save-button");
const pdfButton = document.getElementById("schedule-pdf-button");
const message = document.getElementById("schedule-editor-message");

let loggedTeam = window.__habaduraLoggedTeam || null;
let activeRound = 1;
let draft = null;
let stopListening = null;
let teamOptions = [];

function emptyMatch(number) {
  return {
    number,
    date: "",
    times: [...FIXED_TIMES],
    slots: FIXED_TIMES.map(() => Array(LANES).fill(""))
  };
}
function normalizeSchedule(data, round = activeRound) {
  const count = Math.max(1, Number(data?.matchCount || data?.matches?.length || 5));
  const matches = Array.from({ length: count }, (_, index) => {
    const source = data?.matches?.[index] || {};
    return {
      number: Number(source.number) || index + 1,
      date: String(source.date || ""),
      times: FIXED_TIMES.map((defaultTime, timeIndex) => String(source.times?.[timeIndex] || defaultTime)),
      slots: FIXED_TIMES.map((_, timeIndex) =>
        Array.from({ length: LANES }, (_, laneIndex) =>
          String(source.slots?.[timeIndex]?.[laneIndex] || "")
        )
      )
    };
  });
  return { league: LEAGUE, round: Number(round), matchCount: count, matches };
}
function readInitialStaticTable() {
  const rows = [...(publicBody?.rows || [])];
  const matches = [];
  for (let i = 0; i < rows.length; i += 3) {
    const group = rows.slice(i, i + 3);
    if (!group.length) continue;
    const first = group[0].cells;
    const number = Number(first[0]?.textContent.trim()) || matches.length + 1;
    const date = first[1]?.textContent.trim() || "";
    const slots = group.map((row, rowIndex) => {
      const cells = [...row.cells];
      const offset = rowIndex === 0 ? 3 : 1;
      return Array.from({ length: LANES }, (_, lane) => {
        const value = cells[offset + lane]?.textContent.trim() || "";
        return value === "-" ? "" : value;
      });
    });
    matches.push({ number, date, times: [...FIXED_TIMES], slots });
  }
  return normalizeSchedule({ matchCount: matches.length || 5, matches }, 1);
}
const initialStaticSchedule = readInitialStaticTable();

function documentRef(round) {
  return doc(db, COLLECTION, `liga-${LEAGUE}-kolo-${round}`);
}
function canEdit(team) {
  return String(team?.name || "").trim().localeCompare(ALLOWED_TEAM_NAME, "cs", { sensitivity: "base" }) === 0;
}
function setMessage(text, isError = false) {
  if (!message) return;
  message.textContent = text || "";
  message.style.color = isError ? "#ffb3b3" : "#fff";
}
function formatCzechDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || "");
}
function renderPublic(data) {
  const schedule = normalizeSchedule(data, activeRound);
  if (publicTitle) publicTitle.textContent = `Rozpis zápasů - 1. liga - ${schedule.round}. kolo`;
  if (!publicBody) return;
  publicBody.innerHTML = "";
  schedule.matches.forEach((match) => {
    schedule.matches.forEach(() => {}); // stabilni struktura pro tisk
    match.times.forEach((time, timeIndex) => {
      const tr = document.createElement("tr");
      if (timeIndex === 0) {
        const number = document.createElement("td");
        number.rowSpan = 3;
        number.textContent = match.number;
        tr.appendChild(number);
        const date = document.createElement("td");
        date.rowSpan = 3;
        date.textContent = formatCzechDate(match.date);
        tr.appendChild(date);
      }
      const timeCell = document.createElement("td");
      timeCell.textContent = time;
      tr.appendChild(timeCell);
      for (let lane = 0; lane < LANES; lane += 1) {
        const td = document.createElement("td");
        td.textContent = match.slots[timeIndex][lane] || "";
        tr.appendChild(td);
      }
      publicBody.appendChild(tr);
    });
  });
}
function readEditorIntoDraft() {
  if (!draft) return;
  const blocks = [...editorRows.querySelectorAll(".schedule-edit-match")];
  draft.matches = blocks.map((block, index) => ({
    number: Number(block.querySelector(".schedule-number")?.value) || index + 1,
    date: block.querySelector(".schedule-date")?.value || "",
    times: FIXED_TIMES.map((defaultTime, timeIndex) =>
      block.querySelector(`[data-time-value="${timeIndex}"]`)?.value.trim() || defaultTime
    ),
    slots: FIXED_TIMES.map((_, timeIndex) =>
      Array.from({ length: LANES }, (_, laneIndex) =>
        block.querySelector(`[data-time="${timeIndex}"][data-lane="${laneIndex}"]`)?.value.trim() || ""
      )
    )
  }));
  draft.matchCount = draft.matches.length;
}
async function loadTeamNames() {
  try {
    const snapshot = await getDocs(collection(db, "teams"));
    const uniqueTeams = new Map();
    snapshot.docs
      .map((teamDoc) => teamDoc.data())
      .filter((team) => [1, 2].includes(Number(team.liga)) && typeof team.name === "string")
      .forEach((team) => {
        const name = team.name.trim();
        const liga = Number(team.liga);
        if (name) uniqueTeams.set(`${liga}|${name}`, { name, liga });
      });
    teamOptions = [...uniqueTeams.values()].sort((a, b) =>
      a.liga - b.liga || a.name.localeCompare(b.name, "cs")
    );
    if (draft && canEdit(loggedTeam)) renderEditor();
  } catch (error) {
    console.error("Seznam týmů nelze načíst:", error);
    setMessage("Seznam týmů se nepodařilo načíst.", true);
  }
}
function createTeamSelect(value, timeIndex, laneIndex) {
  const select = document.createElement("select");
  select.className = "schedule-team-select";
  select.dataset.time = timeIndex;
  select.dataset.lane = laneIndex;

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "— volné / rezerva —";
  select.appendChild(emptyOption);

  const groups = new Map();
  teamOptions.forEach((team) => {
    if (!groups.has(team.liga)) {
      const group = document.createElement("optgroup");
      group.label = `${team.liga}. liga`;
      groups.set(team.liga, group);
      select.appendChild(group);
    }
    const option = document.createElement("option");
    option.value = team.name;
    option.textContent = team.name;
    groups.get(team.liga).appendChild(option);
  });

  // Zachování staršího názvu, i když už není v kolekci teams.
  if (value && !teamOptions.some((team) => team.name === value)) {
    const legacyOption = document.createElement("option");
    legacyOption.value = value;
    legacyOption.textContent = `${value} (dříve uložený tým)`;
    select.appendChild(legacyOption);
  }
  select.value = value || "";
  return select;
}
function renderEditor() {
  if (!editorRows || !draft) return;
  editorRows.innerHTML = "";
  draft.matches.forEach((match, index) => {
    const block = document.createElement("div");
    block.className = "schedule-edit-match";
    const heading = document.createElement("div");
    heading.className = "schedule-edit-heading";
    heading.innerHTML = `<label><strong>Zápas č.</strong> <input class="schedule-number" type="number" min="1" value="${match.number || index + 1}"></label><label>Datum <input class="schedule-date" type="date" value="${match.date || ""}"></label>`;
    block.appendChild(heading);
    const table = document.createElement("table");
    table.className = "schedule-editor-table";
    table.innerHTML = `<thead><tr><th>Čas</th><th>Dráha 1</th><th>Dráha 2</th><th>Dráha 3</th><th>Dráha 4</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    match.times.forEach((time, timeIndex) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input class="schedule-time" type="time" data-time-value="${timeIndex}" value="${time}"></td>`;
      for (let lane = 0; lane < LANES; lane += 1) {
        const td = document.createElement("td");
        const select = createTeamSelect(match.slots[timeIndex][lane] || "", timeIndex, lane);
        td.appendChild(select);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    block.appendChild(table);
    editorRows.appendChild(block);
  });
  if (matchCountInput) matchCountInput.value = draft.matchCount;
}
function resizeDraft(count) {
  readEditorIntoDraft();
  count = Math.max(1, Math.min(30, Number(count) || 1));
  while (draft.matches.length < count) draft.matches.push(emptyMatch(draft.matches.length + 1));
  draft.matches = draft.matches.slice(0, count);
  draft.matchCount = count;
  renderEditor();
}
async function loadRound(round) {
  activeRound = Number(round);
  if (stopListening) stopListening();
  stopListening = onSnapshot(documentRef(activeRound), (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : (activeRound === 1 ? initialStaticSchedule : normalizeSchedule({}, activeRound));
    draft = normalizeSchedule(data, activeRound);
    renderPublic(draft);
    if (canEdit(loggedTeam)) renderEditor();
  }, (error) => {
    console.error("Rozpis nelze načíst:", error);
    setMessage("Rozpis se nepodařilo načíst.", true);
  });
}

roundSelect?.addEventListener("change", () => loadRound(roundSelect.value));
matchCountInput?.addEventListener("change", () => resizeDraft(matchCountInput.value));
saveButton?.addEventListener("click", async () => {
  if (!canEdit(loggedTeam)) return setMessage("Rozpis může upravovat pouze tým Benešov D.", true);
  readEditorIntoDraft();
  saveButton.disabled = true;
  setMessage("Ukládám…");
  try {
    await setDoc(documentRef(activeRound), {
      ...draft,
      updatedAt: serverTimestamp(),
      updatedByTeamId: loggedTeam.id || "",
      updatedByTeamName: loggedTeam.name || ""
    }, { merge: false });
    setMessage("Rozpis byl uložen. Prázdná místa zůstala jako rezervy pro pozdější doplnění.");
  } catch (error) {
    console.error("Uložení rozpisu selhalo:", error);
    setMessage("Rozpis se nepodařilo uložit. Zkontrolujte pravidla Firestore.", true);
  } finally {
    saveButton.disabled = false;
  }
});
pdfButton?.addEventListener("click", () => {
  if (!canEdit(loggedTeam)) return setMessage("PDF může vytvořit pouze přihlášený tým Benešov D.", true);
  readEditorIntoDraft();
  renderPublic(draft);
  document.body.classList.add("print-schedule-only");
  window.print();
  setTimeout(() => document.body.classList.remove("print-schedule-only"), 500);
});
window.addEventListener("afterprint", () => document.body.classList.remove("print-schedule-only"));

pdfButton?.addEventListener("click", () => {
  if (!canEdit(loggedTeam)) return setMessage("PDF může vytvořit pouze přihlášený tým Benešov D.", true);
  readEditorIntoDraft();
  renderPublic(draft);
  document.body.classList.add("print-schedule-only");
  window.print();
  setTimeout(() => document.body.classList.remove("print-schedule-only"), 500);
});
window.addEventListener("afterprint", () => document.body.classList.remove("print-schedule-only"));

pdfButton?.addEventListener("click", () => {
  if (!canEdit(loggedTeam)) return setMessage("PDF může vytvořit pouze přihlášený tým Benešov D.", true);
  readEditorIntoDraft();
  renderPublic(draft);
  document.body.classList.add("print-schedule-only");
  window.print();
  setTimeout(() => document.body.classList.remove("print-schedule-only"), 500);
});
window.addEventListener("afterprint", () => document.body.classList.remove("print-schedule-only"));

window.addEventListener("habadura-team-changed", (event) => {
  loggedTeam = event.detail?.team || null;
  if (editor) editor.hidden = !canEdit(loggedTeam);
  if (canEdit(loggedTeam) && draft) renderEditor();
});
if (editor) editor.hidden = !canEdit(loggedTeam);
loadTeamNames();
loadRound(activeRound);
