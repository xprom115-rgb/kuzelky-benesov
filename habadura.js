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

  const sumHome = sumArray(hk);
  const sumAway = sumArray(ak);

  const scoreHomeBase = sumArray(hb);
  const scoreAwayBase = sumArray(ab);

  // ✅ Bonus za kuželky do Skóre: +2 pro vítěze, při remíze 1:1
  let bonusHome = 0, bonusAway = 0;
  if (sumHome > sumAway) { bonusHome = 2; bonusAway = 0; }
  else if (sumHome < sumAway) { bonusHome = 0; bonusAway = 2; }
  else { bonusHome = 1; bonusAway = 1; } // ✅ remíza kuželek

  const scoreHome = scoreHomeBase + bonusHome;
  const scoreAway = scoreAwayBase + bonusAway;

  // UI souhrn
  sumBodyEl.textContent = `${scoreHome} : ${scoreAway}`;
  sumKuzEl.textContent  = `${sumHome} : ${sumAway}`;

  // Kontrolní součty (pomůžou validaci)
  const baseTotal = scoreHomeBase + scoreAwayBase;   // má být 6
  const totalScore = scoreHome + scoreAway;          // má být 8

  return {
    sumHome, sumAway,
    scoreHomeBase, scoreAwayBase,
    bonusHome, bonusAway,
    scoreHome, scoreAway,
    baseTotal, totalScore
  };
}
``
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
  // Pokud chybí hráči v některém týmu, nedovol ukládat zápas
const homeOk = homePlayers.length >= 3;
const awayOk = awayPlayers.length >= 3;

submitBtn.disabled = !(homeOk && awayOk);
submitBtn.style.opacity = submitBtn.disabled ? "0.5" : "1";
submitBtn.style.cursor = submitBtn.disabled ? "not-allowed" : "pointer";

if (submitBtn.disabled) {
  submitBtn.title = "Nejdřív přidej alespoň 3 hráče do domácího i hostujícího týmu (Firestore: players).";
} else {
  submitBtn.title = "";
}
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
ligaSelect.addEventListener("change", ()=> switchLiga(ligaSelect.value));
teamHome.addEventListener("change", fillPlayers);
teamAway.addEventListener("change", fillPlayers);

// --------------- Read players from form ---------------
function readPlayers(side){
  const sels = side === "home" ? [...homePlayerSelects] : [...awayPlayerSelects];
  const kuzs = side === "home" ? [...homeKuzInputs] : [...awayKuzInputs];
  const bods = side === "home" ? [...homeBodyInputs] : [...awayBodyInputs];

  return sels.map((sel, i) => ({
    playerId: sel.value,
    kuzelky: Number(kuzs[i].value) || 0,
    body: Number(bods[i].value) || 0
  }));
}

function validatePlayers(list){
  for (const p of list){
    if (!p.playerId) return "Nevybral jsi hráče ve všech řádcích.";
    if (p.kuzelky < 0) return "Kuželky musí být kladné číslo.";
    if (![0,1,2].includes(p.body)) return "Body musí být 0, 1 nebo 2.";
  }
  return null;
}

// --------------- Save match (create only) ---------------
async function saveMatch(){
  const liga = Number(ligaSelect.value);
  const homeTeam = teamHome.value;
  const awayTeam = teamAway.value;
  const date = dateInput.value;

  if (!date) return alert("Vyber datum zápasu.");
  if (!homeTeam || !awayTeam) return alert("Vyber oba týmy.");
  if (homeTeam === awayTeam) return alert("Domácí a hosté musí být různé týmy.");

  const homePlayers = readPlayers("home");
  const awayPlayers = readPlayers("away");
  const s = computeSums();

// ✅ kontrola: hráčské body musí dát dohromady 6
if (s.baseTotal !== 6) {
  alert(`⚠️ Chyba bodů: součet bodů hráčů musí být 6 (je ${s.baseTotal}).\nZkontrolujte body 0/1/2 u hráčů.`);
  return;
}

// ✅ kontrola: celkové Skóre musí být 8
if (s.totalScore !== 8) {
  alert(`⚠️ Chyba: celkové Skóre musí být 8 (je ${s.totalScore}).`);
  return;
}

  const err1 = validatePlayers(homePlayers);
  if (err1) return alert(err1);
  const err2 = validatePlayers(awayPlayers);
  if (err2) return alert(err2);

  const { sumHK, sumHB, sumAK, sumAB, bonusHome, bonusAway, totalHB, totalAB } = computeSums();

  const data = {
    liga,
    date,
    homeTeam,
    awayTeam,
    homePlayers,
    awayPlayers,

    sumHome: sumHK,
    sumAway: sumAK,

    // ✅ týmové body už včetně bonusu
    bodyHome: totalHB,
    bodyAway: totalAB,

    // bonus ukládáme pro kontrolu
    bonusHome,
    bonusAway,

    createdAt: Timestamp.now()
  };

  try{
    await addDoc(collection(db, "matches"), data);
    alert("✅ Zápas byl uložen.");

    // vyčistit čísla (hráče necháme vybrané)
    [...homeKuzInputs, ...homeBodyInputs, ...awayKuzInputs, ...awayBodyInputs].forEach(i => i.value = "");
    computeSums();
  } catch(e){
    console.error(e);
    alert("❌ Nepodařilo se uložit zápas (zřejmě práva). Podívej se do konzole.");
  }
}

submitBtn.addEventListener("click", saveMatch);

// --------------- Teams table ---------------
function computeTeamsTable(matches, liga){
  const ligaTeams = teams.filter(t => Number(t.liga) === Number(liga));
  const stats = {};
  ligaTeams.forEach(t => {
    stats[t.id] = {
      teamId: t.id,
      name: t.name,
      zapasy: 0,
      kuzelky: 0,
      body: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      nv: 0
    };
  });

  matches.forEach(m => {
    const home = stats[m.homeTeam];
    const away = stats[m.awayTeam];
    if (!home || !away) return;

    home.zapasy++;
    home.kuzelky += m.sumHome;
    home.body += m.bodyHome;             // ✅ už včetně bonusu
    home.scoreFor += m.bodyHome;
    home.scoreAgainst += m.bodyAway;
    (m.homePlayers||[]).forEach(p => { if ((p.kuzelky||0) > home.nv) home.nv = p.kuzelky||0; });

    away.zapasy++;
    away.kuzelky += m.sumAway;
    away.body += m.bodyAway;             // ✅ už včetně bonusu
    away.scoreFor += m.bodyAway;
    away.scoreAgainst += m.bodyHome;
    (m.awayPlayers||[]).forEach(p => { if ((p.kuzelky||0) > away.nv) away.nv = p.kuzelky||0; });
  });

  const rows = Object.values(stats).map(s => ({
    ...s,
    prumer: s.zapasy ? (s.kuzelky / s.zapasy).toFixed(2) : "0.00"
  }));

  rows.sort((a,b)=>{
    if (b.body !== a.body) return b.body - a.body;
    const diff = (b.scoreFor - b.scoreAgainst) - (a.scoreFor - a.scoreAgainst);
    if (diff !== 0) return diff;
    return b.kuzelky - a.kuzelky;
  });

  return rows;
}

function renderTeamsTable(liga, matches){
  const rows = computeTeamsTable(matches, liga);
  let html = `<table class="tabulka">
    <tr>
      <th>Poř</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Skóre</th><th>Body</th><th>NV</th>
    </tr>`;

  rows.forEach((r,i)=>{
    html += `<tr>
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td>${r.kuzelky}</td>
      <td>${r.zapasy}</td>
      <td>${r.prumer}</td>
      <td>${r.scoreFor}:${r.scoreAgainst}</td>
      <td>${r.body}</td>
      <td>${r.nv}</td>
    </tr>`;
  });

  html += `</table>`;
  tabDruzstva.innerHTML = html;
}

// --------------- Players table ---------------
function computePlayersTable(matches, liga){
  const ps = {};

  function addLine(playerId, kuzelky, body){
    const pl = players.find(x => x.id === playerId);
    if (!pl) return;
    if (Number(pl.liga) !== Number(liga)) return;

    if (!ps[playerId]){
      ps[playerId] = { id: playerId, name: pl.name, teamId: pl.teamId, zapasy: 0, kuzelky: 0, body: 0, nv: 0 };
    }
    ps[playerId].zapasy++;
    ps[playerId].kuzelky += (kuzelky||0);
    ps[playerId].body += (body||0); // individuální body (bez bonusu)
    if ((kuzelky||0) > ps[playerId].nv) ps[playerId].nv = kuzelky||0;
  }

  matches.forEach(m=>{
    (m.homePlayers||[]).forEach(p => addLine(p.playerId, p.kuzelky, p.body));
    (m.awayPlayers||[]).forEach(p => addLine(p.playerId, p.kuzelky, p.body));
  });

  const rows = Object.values(ps).map(r => ({
    ...r,
    teamName: teamName(r.teamId),
    prumer: r.zapasy ? (r.kuzelky / r.zapasy).toFixed(2) : "0.00"
  }));

  rows.sort((a,b)=>{
    if (Number(b.prumer) !== Number(a.prumer)) return Number(b.prumer) - Number(a.prumer);
    if (b.nv !== a.nv) return b.nv - a.nv;
    return b.kuzelky - a.kuzelky;
  });

  return rows;
}

function renderPlayersTable(liga, matches){
  const rows = computePlayersTable(matches, liga);
  let html = `<table class="tabulka">
    <tr>
      <th>Poř</th><th>Hráč</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Body</th><th>NV</th>
    </tr>`;

  rows.forEach((r,i)=>{
    html += `<tr>
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td>${r.teamName}</td>
      <td>${r.kuzelky}</td>
      <td>${r.zapasy}</td>
      <td>${r.prumer}</td>
      <td>${r.body}</td>
      <td>${r.nv}</td>
    </tr>`;
  });

  html += `</table>`;
  tabHracu.innerHTML = html;
}

// --------------- Matrix ---------------
function buildMatchMap(matches){
  const map = new Map();
  matches.forEach(m=>{
    if (m.homeTeam && m.awayTeam){
      map.set(`${m.homeTeam}-${m.awayTeam}`, m);
    }
  });
  return map;
}

function renderMatrix(liga, matches){
  const ligaTeams = teams
    .filter(t => Number(t.liga) === Number(liga))
    .sort((a,b)=>csCompare(a.name,b.name));

  const map = buildMatchMap(matches);

  let html = `<div style="overflow:auto;">
    <table class="tabulka" style="min-width:900px;">
      <tr>
        <th style="position:sticky;left:0;z-index:2;">Družstvo</th>
        ${ligaTeams.map(t=>`<th>${t.name}</th>`).join("")}
      </tr>`;

  ligaTeams.forEach(rowT=>{
    html += `<tr>
      <th style="position:sticky;left:0;z-index:1;">${rowT.name}</th>`;

    ligaTeams.forEach(colT=>{
      if (rowT.id === colT.id){
        html += `<td style="background:rgba(255,255,255,0.12); text-align:center; font-weight:bold;">—</td>`;
        return;
      }

      const direct = map.get(`${rowT.id}-${colT.id}`);
      const reverse = map.get(`${colT.id}-${rowT.id}`);

      const m = direct || reverse;
      if (!m){
        html += `<td></td>`;
        return;
      }

      const reversed = !direct && !!reverse;
      const bodyA = reversed ? m.bodyAway : m.bodyHome;
      const bodyB = reversed ? m.bodyHome : m.bodyAway;
      const kuzA  = reversed ? m.sumAway  : m.sumHome;
      const kuzB  = reversed ? m.sumHome  : m.sumAway;

      html += `<td style="text-align:center;">
        <div style="font-weight:bold;color:#ffd700;">${bodyA} : ${bodyB}</div>
        <div style="font-size:12px;opacity:0.9;">${kuzA} : ${kuzB}</div>
      </td>`;
    });

    html += `</tr>`;
  });

  html += `</table></div>`;
  tabMatice.innerHTML = html;
}

// --------------- Listen matches (both leagues) ---------------
function listenMatches(liga){
  const q = query(collection(db, "matches"), where("liga", "==", Number(liga)));
  onSnapshot(q, (snap)=>{
    matchesCache[liga] = snap.docs.map(d => d.data());
    if (Number(ligaSelect.value) === Number(liga)){
      renderAllFromCache(Number(liga));
    }
  });
}

// --------------- Init ---------------
window.addEventListener("DOMContentLoaded", async ()=>{
  try{
    if (!dateInput.value) dateInput.value = todayISO();

    await loadTeams();
    await loadPlayers();

    listenMatches(1);
    listenMatches(2);

    switchLiga("1");
    computeSums();
  } catch(e){
    console.error(e);
    alert("Nepodařilo se načíst data Habaďůry (týmy/hráči). Podívej se do konzole.");
  }
});
