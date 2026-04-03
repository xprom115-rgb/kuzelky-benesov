import { db } from "./firebase-config.js";
import { ADMIN_PASSWORD_HASH } from "./admin-config.js";

import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ admin-habadura.js načten");

// --------------------
// DOM
// --------------------
const loginBox  = document.getElementById("admin-login");
const panelBox  = document.getElementById("admin-panel");
const passInput = document.getElementById("admin-pass");
const loginBtn  = document.getElementById("admin-login-btn");
const loginMsg  = document.getElementById("admin-login-msg");
const logoutBtn = document.getElementById("admin-logout-btn");

const ligaAdmin = document.getElementById("liga-admin");

// tabs
document.querySelectorAll(".tabbtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabbtn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;

    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById(`panel-${tab}`).classList.add("active");
  });
});

// lists
const matchesListEl = document.getElementById("matches-list");
const teamsListEl   = document.getElementById("teams-list");
const playersListEl = document.getElementById("players-list");

// filters
const matchFilterDate = document.getElementById("match-filter-date");
const matchFilterClear = document.getElementById("match-filter-clear");

const teamNewName = document.getElementById("team-new-name");
const teamAddBtn  = document.getElementById("team-add");

const playersTeamFilter = document.getElementById("players-team-filter");
const playerNewName = document.getElementById("player-new-name");
const playerAddBtn  = document.getElementById("player-add");

// edit match
const editBox = document.getElementById("edit-box");
const editDate = document.getElementById("edit-date");
const editHomeTeam = document.getElementById("edit-home-team");
const editAwayTeam = document.getElementById("edit-away-team");
const editHomePlayersWrap = document.getElementById("edit-home-players");
const editAwayPlayersWrap = document.getElementById("edit-away-players");
const editSumHomeKuz = document.getElementById("edit-sum-home-kuz");
const editSumHomeBody = document.getElementById("edit-sum-home-body");
const editSumAwayKuz = document.getElementById("edit-sum-away-kuz");
const editSumAwayBody = document.getElementById("edit-sum-away-body");
const editCancel = document.getElementById("edit-cancel");
const editSave = document.getElementById("edit-save");
const editMsg = document.getElementById("edit-msg");

// --------------------
// Auth (UI-level)
// --------------------
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2,"0")).join("");
}

function setLoggedIn(on){
  if (on){
    sessionStorage.setItem("admin_ok", "1");
    loginBox.style.display = "none";
    panelBox.style.display = "block";
    startRealtime();
  } else {
    sessionStorage.removeItem("admin_ok");
    loginBox.style.display = "block";
    panelBox.style.display = "none";
    stopRealtime();
  }
}

loginBtn.addEventListener("click", async () => {
  loginMsg.textContent = "";
  const pass = passInput.value || "";
  if (!pass){ loginMsg.textContent = "Zadejte heslo."; return; }

  const h = await sha256(pass);
  if (h === ADMIN_PASSWORD_HASH){
    setLoggedIn(true);
  } else {
    loginMsg.textContent = "Nesprávné heslo.";
  }
});

logoutBtn.addEventListener("click", () => setLoggedIn(false));

if (sessionStorage.getItem("admin_ok") === "1"){
  setLoggedIn(true);
}

// --------------------
// Data caches
// --------------------
let unsubTeams = null;
let unsubPlayers = null;
let unsubMatches = null;

let teams = [];   // [{id,name,liga}]
let players = []; // [{id,name,teamId,liga}]
let matches = []; // [{docId,data}]

let currentEditMatchId = null;

// helpers
const byId = (arr, id) => arr.find(x => x.id === id);
const teamName = (id) => (byId(teams, id)?.name) || "(tým?)";
const playerName = (id) => (byId(players, id)?.name) || "(hráč?)";

function stopRealtime(){
  if (unsubTeams) unsubTeams();
  if (unsubPlayers) unsubPlayers();
  if (unsubMatches) unsubMatches();
  unsubTeams = unsubPlayers = unsubMatches = null;
}

function startRealtime(){
  stopRealtime();

  // teams
  unsubTeams = onSnapshot(collection(db,"teams"), (snap) => {
    teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTeams();
    renderPlayersTeamFilter();
    // pokud editujeme zápas, obnovíme selecty
    if (editBox.style.display !== "none") fillEditTeamSelects();
  });

