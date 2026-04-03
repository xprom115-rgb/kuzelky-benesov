// habadura.js (PLNÁ VERZE – bonus za kuželky +2, remíza +1:+1)
// ============================================================
// Firestore Rules B:
// - teams/players/matches: read
// - matches: create
// - matches update/delete: false
//
// Kolekce:
// - teams:   { name: string, liga: number }
// - players: { name: string, teamId: string, liga: number }
// - matches: ukládáme zápasy (create)

// --------------- Imports ---------------
import { db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  addDoc,
  Timestamp,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ habadura.js načten (aktuální)");

// --------------- DOM ---------------
const btnLiga1   = document.getElementById("btn-liga1");
const btnLiga2   = document.getElementById("btn-liga2");
const ligaSelect = document.getElementById("liga-select");

const teamHome = document.getElementById("team-home");
const teamAway = document.getElementById("team-away");

const homePlayerSelects = document.querySelectorAll(".home-player");
const awayPlayerSelects = document.querySelectorAll(".away-player");

const homeKuzInputs  = document.querySelectorAll(".home-kuz");
const homeBodyInputs = document.querySelectorAll(".home-body");
const awayKuzInputs  = document.querySelectorAll(".away-kuz");
const awayBodyInputs = document.querySelectorAll(".away-body");

const sumBodyEl = document.getElementById("sum-body");
const sumKuzEl  = document.getElementById("sum-kuz");
const dateInput = document.getElementById("match-date");
const submitBtn = document.getElementById("submit-match");

const tabDruzstva = document.getElementById("tab-druzstva");
const tabHracu    = document.getElementById("tab-hracu");
const tabMatice   = document.getElementById("tab-matice");

// --------------- Data ---------------
let teams = [];    // [{id,name,liga}]
let players = [];  // [{id,name,teamId,liga}]
const matchesCache = { 1: [], 2: [] };

// --------------- Helpers ---------------
function csCompare(a, b) { return (a || "").localeCompare(b || "", "cs"); }

function makeOption(value, text) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = text;
  return opt;
}

function setLigaUI(liga) {
  ligaSelect.value = String(liga);
  btnLiga1.classList.toggle("active", String(liga) === "1");
  btnLiga2.classList.toggle("active", String(liga) === "2");
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function sumArray(arr){ return arr.reduce((a,b)=>a+b,0); }

function teamName(id){ return teams.find(t => t.id === id)?.name || "(tým?)"; }
function playerName(id){ return players.find(p => p.id === id)?.name || "(hráč?)"; }

// --------------- Compute sums (+ bonus) ---------------
function computeSums(){
  const hk = [...homeKuzInputs].map(i => Number(i.value)||0);
  const hb = [...homeBodyInputs].map(i => Number(i.value)||0);
  const ak = [...awayKuzInputs].map(i => Number(i.value)||0);
  const ab = [...awayBodyInputs].map(i => Number(i.value)||0);

  const sumHK = sumArray(hk);
  const sumHB = sumArray(hb);
  const sumAK = sumArray(ak);
  const sumAB = sumArray(ab);

  // ✅ bonus za kuželky: vítěz +2, remíza +1:+1
  let bonusHome = 0, bonusAway = 0;
  if (sumHK > sumAK) { bonusHome = 2; bonusAway = 0; }
  else if (sumHK < sumAK) { bonusHome = 0; bonusAway = 2; }
  else { bonusHome = 1; bonusAway = 1; } // remíza kuželek

  const totalHB = sumHB + bonusHome;
  const totalAB = sumAB + bonusAway;

  // UI souhrn (už včetně bonusu)
  sumBodyEl.textContent = `${totalHB} : ${totalAB}`;
  sumKuzEl.textContent  = `${sumHK} : ${sumAK}`;

  return { sumHK, sumHB, sumAK, sumAB, bonusHome, bonusAway, totalHB, totalAB };
}

// přepočítávat souhrn při změně inputů
[...homeKuzInputs, ...homeBodyInputs, ...awayKuzInputs, ...awayBodyInputs].forEach(inp=>{
  inp.addEventListener("input", computeSums);
});

// --------------- Load teams & players ---------------
async function loadTeams(){
  const snap = await getDocs(collection(db, "teams"));
  teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log("✅ Týmy načteny:", teams.length);
}

async function loadPlayers(){
  const snap = await getDocs(collection(db, "players"));
  players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log("✅ Hráči načteni:", players.length);
}

// --------------- Fill selects ---------------
function fillTeams(liga){
  const ligaNum = Number(liga);
  const ligaTeams = teams
    .filter(t => Number(t.liga) === ligaNum)
    .sort((a,b)=>csCompare(a.name,b.name));

  teamHome.innerHTML = "";
  teamAway.innerHTML = "";

  ligaTeams.forEach(t => {
    teamHome.appendChild(makeOption(t.id, t.name));
    teamAway.appendChild(makeOption(t.id, t.name));
  });

  if (ligaTeams.length >= 2) {
    teamAway.value = ligaTeams[1].id;
  }

  fillPlayers();
}

function fillPlayers(){
  const homeTeamId = teamHome.value;
  const awayTeamId = teamAway.value;

  const homePlayers = players
    .filter(p => p.teamId === homeTeamId)
    .sort((a,b)=>csCompare(a.name,b.name));

  const awayPlayers = players
    .filter(p => p.teamId === awayTeamId)
    .sort((a,b)=>csCompare(a.name,b.name));

  homePlayerSelects.forEach(sel => {
    sel.innerHTML = "";
    if (!homePlayers.length){
      sel.appendChild(makeOption("", "— žádní hráči —"));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    homePlayers.forEach(p => sel.appendChild(makeOption(p.id, p.name)));
  });

  awayPlayerSelects.forEach(sel => {
    sel.innerHTML = "";
    if (!awayPlayers.length){
      sel.appendChild(makeOption("", "— žádní hráči —"));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    awayPlayers.forEach(p => sel.appendChild(makeOption(p.id, p.name)));
  });
}

// --------------- Switch liga ---------------
function renderAllFromCache(liga){
  const matches = matchesCache[liga] || [];
  renderTeamsTable(liga, matches);
  renderPlayersTable(liga, matches);
  renderMatrix(liga, matches);
}

function switchLiga(liga){
  console.log("➡️ Přepínám ligu na:", liga);
  setLigaUI(liga);
  fillTeams(liga);
  renderAllFromCache(Number(liga));
}

btnLiga1.addEventListener("click", (e)=>{ e.preventDefault(); switchLiga("1"); });
btnLiga2.addEventListener("click", (e)=>{ e.preventDefault(); switchLiga("2"); });
