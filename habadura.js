// habadura.js — FINÁLNÍ VERZE (Memoriál Vavříka a Košaře)
// =====================================================
// LOGIKA:
// 1) "Skóre" zápasu = (součet bodů hráčů 0/1/2) + (bonus za kuželky: +2 nebo 1:1 při remíze)
//    => musí vždy platit: (scoreHomeBase + scoreAwayBase) = 6 a (scoreHome + scoreAway) = 8
// 2) "Body" v tabulce družstev (2/1/0) se určuje podle výsledného Skóre (po bonusu kuželek)
// 3) NV týmu = nejlepší týmový výkon kuželek (max součet kuželek týmu v zápase)
// 4) DUPLICITY: stejná dvojice týmů se v rámci ligy+sezóny+fáze uloží jen 1×
//    - sezóna má fáze autumn/spring (podzim/jaro)
//    - bez úprav HTML lze přepnout přes URL parametry:
//        habadura.html?season=2025-2026&phase=autumn
//        habadura.html?season=2025-2026&phase=spring
//
// Firestore:
// - teams:   { name: string, liga: number }
// - players: { name: string, teamId: string, liga: number }
// - matches: ukládáme: seasonId, phase, liga, date, home/away, players, sumHome/sumAway,
//            scoreHomeBase/scoreAwayBase, bonusScoreHome/bonusScoreAway, scoreHome/scoreAway,
//            leaguePointsHome/leaguePointsAway, createdAt
//
// Pozn.: Tato verze je kompatibilní s vašimi rules: read pro teams/players/matches, create pro matches,
// update/delete pro admin (přes Auth + UID).

import { db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  setDoc,
  doc,
  Timestamp,
  query,
  where,
  onSnapshot,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ habadura.js načten (finální)");

let SEASON_ID = null;
let ROUND = null;
let seasonReady = false;


// -------------------------
// DOM
// -------------------------
const btnLiga1   = document.getElementById("btn-liga1");
const btnLiga2   = document.getElementById("btn-liga2");
const ligaSelect = document.getElementById("liga-select");
const seasonBadge = document.getElementById("seasonBadge");

const teamHome = document.getElementById("team-home");
const teamAway = document.getElementById("team-away");

const homePlayerSelects = document.querySelectorAll(".home-player");
const awayPlayerSelects = document.querySelectorAll(".away-player");

const homeKuzInputs  = document.querySelectorAll(".home-kuz");
const homeBodyInputs = document.querySelectorAll(".home-body");
const awayKuzInputs  = document.querySelectorAll(".away-kuz");
const awayBodyInputs = document.querySelectorAll(".away-body");

const sumBodyEl = document.getElementById("sum-body");  // zobrazuje SKÓRE
const sumKuzEl  = document.getElementById("sum-kuz");   // zobrazuje KUŽELKY

const dateInput = document.getElementById("match-date");
const submitBtn = document.getElementById("submit-match");

const tabDruzstva = document.getElementById("tab-druzstva");
const tabHracu    = document.getElementById("tab-hracu");
const tabMatice   = document.getElementById("tab-matice");

// -------------------------
// Data
// -------------------------
let teams = [];     // [{id,name,liga}]
let players = [];   // [{id,name,teamId,liga}]

// cache zápasů:
// - totalsCache: sčítá celou sezónu (podzim + jaro) => tabulka družstev + hráčů
// - phaseCache:  jen aktuální fáze (podzim/jaro) => matice zápasů
const totalsCache = { 1: [], 2: [] }; // seasonId across both phases
const phaseCache  = { 1: [], 2: [] }; // seasonId + current PHASE only
// ===== unsubscribe references =====
let unsubTotals1 = null, unsubTotals2 = null;
let unsubPhase1  = null, unsubPhase2  = null;

function stopMatchListeners(){
  unsubTotals1?.(); unsubTotals2?.();
  unsubPhase1?.();  unsubPhase2?.();
  unsubTotals1 = unsubTotals2 = unsubPhase1 = unsubPhase2 = null;
}
function startMatchListeners(){
  stopMatchListeners();

  // --- totals: celá sezóna (podzim + jaro) => tabulka družstev + hráčů
  const qT1 = query(collection(db, "matches"),
    where("liga", "==", 1),
    where("seasonId", "==", SEASON_ID)
  );

  const qT2 = query(collection(db, "matches"),
    where("liga", "==", 2),
    where("seasonId", "==", SEASON_ID)
  );

  unsubTotals1 = onSnapshot(qT1, snap => {
    totalsCache[1] = snap.docs.map(d => d.data());
    if (Number(ligaSelect.value) === 1) renderAll(1);
  });

  unsubTotals2 = onSnapshot(qT2, snap => {
    totalsCache[2] = snap.docs.map(d => d.data());
    if (Number(ligaSelect.value) === 2) renderAll(2);
  });

  // --- phase: pouze aktivní fáze => matice
  const qP1 = query(collection(db, "matches"),
    where("liga", "==", 1),
    where("seasonId", "==", SEASON_ID),
    where("round","==", ROUND)
  );

  const qP2 = query(collection(db, "matches"),
    where("liga", "==", 2),
    where("seasonId", "==", SEASON_ID),
    where("round","==", ROUND)
  );

  unsubPhase1 = onSnapshot(qP1, snap => {
    phaseCache[1] = snap.docs.map(d => d.data());
    if (Number(ligaSelect.value) === 1) renderAll(1);
  });

  unsubPhase2 = onSnapshot(qP2, snap => {
    phaseCache[2] = snap.docs.map(d => d.data());
    if (Number(ligaSelect.value) === 2) renderAll(2);
  });
}
// -------------------------
// Helpers
// -------------------------
function csCompare(a, b) { return (a || "").localeCompare(b || "", "cs"); }
function sumArray(arr){ return arr.reduce((a,b)=>a+b,0); }

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

function teamName(id){ return teams.find(t => t.id === id)?.name || "(tým?)"; }

// ----------------------------------------------------
// 1) Výpočet: kuželky + skóre (6+2=8), bonus 2/0 nebo 1:1
// ----------------------------------------------------
function computeSums(){
  const hk = [...homeKuzInputs].map(i => Number(i.value)||0);
  const hb = [...homeBodyInputs].map(i => Number(i.value)||0);
  const ak = [...awayKuzInputs].map(i => Number(i.value)||0);
  const ab = [...awayBodyInputs].map(i => Number(i.value)||0);

  const sumHome = sumArray(hk);
  const sumAway = sumArray(ak);

  const scoreHomeBase = sumArray(hb);
  const scoreAwayBase = sumArray(ab);

  // bonus do SKÓRE za kuželky: +2 vítězi, při remíze 1:1
  let bonusScoreHome = 0, bonusScoreAway = 0;
  if (sumHome > sumAway) { bonusScoreHome = 2; bonusScoreAway = 0; }
  else if (sumHome < sumAway) { bonusScoreHome = 0; bonusScoreAway = 2; }
  else { bonusScoreHome = 1; bonusScoreAway = 1; } // ✅ remíza kuželek

  const scoreHome = scoreHomeBase + bonusScoreHome;
  const scoreAway = scoreAwayBase + bonusScoreAway;

  // UI
  sumBodyEl.textContent = `${scoreHome} : ${scoreAway}`;
  sumKuzEl.textContent  = `${sumHome} : ${sumAway}`;

  const baseTotal = scoreHomeBase + scoreAwayBase; // musí být 6
  const totalScore = scoreHome + scoreAway;        // musí být 8

  return {
    sumHome, sumAway,
    scoreHomeBase, scoreAwayBase,
    bonusScoreHome, bonusScoreAway,
    scoreHome, scoreAway,
    baseTotal, totalScore
  };
}

// počítat při změně inputů
[...homeKuzInputs, ...homeBodyInputs, ...awayKuzInputs, ...awayBodyInputs].forEach(inp=>{
  inp.addEventListener("input", computeSums);
});

// ----------------------------------------------------
// 2) Načtení týmů a hráčů
// ----------------------------------------------------
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

// ----------------------------------------------------
// 3) Naplnění selectů
// ----------------------------------------------------
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

// ----------------------------------------------------
// 4) Přepínání lig
// ----------------------------------------------------
function renderAll(liga){
  renderTeamsTable(liga, totalsCache[liga] || []);
  renderPlayersTable(liga, totalsCache[liga] || []);
  renderMatrix(liga, phaseCache[liga] || []);
}

function switchLiga(liga){
  console.log("➡️ Přepínám ligu na:", liga);
  setLigaUI(liga);
  fillTeams(liga);
  renderAll(Number(liga));
}

btnLiga1.addEventListener("click", (e)=>{ e.preventDefault(); switchLiga("1"); });
btnLiga2.addEventListener("click", (e)=>{ e.preventDefault(); switchLiga("2"); });
ligaSelect.addEventListener("change", ()=> switchLiga(ligaSelect.value));
teamHome.addEventListener("change", fillPlayers);
teamAway.addEventListener("change", fillPlayers);

// ----------------------------------------------------
// 5) Čtení hráčů z formuláře + validace
// ----------------------------------------------------
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

// ----------------------------------------------------
// 6) Uložení zápasu (zákaz duplicit podzim/jaro)
// ----------------------------------------------------
async function saveMatch(){
  
if (!seasonReady || !SEASON_ID || !ROUND) {
  alert("Sezóna ještě není načtena. Zkuste to prosím za chvíli znovu.");
  return;
}

  const liga = Number(ligaSelect.value);
  const homeTeam = teamHome.value;
  const awayTeam = teamAway.value;
  const date = dateInput.value;

  if (!date) return alert("Vyber datum zápasu.");
  if (!homeTeam || !awayTeam) return alert("Vyber oba týmy.");
  if (homeTeam === awayTeam) return alert("Domácí a hosté musí být různé týmy.");

  const homePlayers = readPlayers("home");
  const awayPlayers = readPlayers("away");

  const err1 = validatePlayers(homePlayers);
  if (err1) return alert(err1);
  const err2 = validatePlayers(awayPlayers);
  if (err2) return alert(err2);

  const s = computeSums();

  // Kontrola: hráčské body musí dát dohromady 6, celkové skóre 8
  if (s.baseTotal !== 6) {
    alert(`⚠️ Součet bodů hráčů musí být 6 (je ${s.baseTotal}). Zkontroluj 0/1/2 u hráčů.`);
    return;
  }
  if (s.totalScore !== 8) {
    alert(`⚠️ Celkové Skóre musí být 8 (je ${s.totalScore}).`);
    return;
  }

  // 2/1/0 body do tabulky podle finálního skóre (po bonusu kuželek)
  let leaguePointsHome = 0, leaguePointsAway = 0;
  if (s.scoreHome > s.scoreAway) { leaguePointsHome = 2; leaguePointsAway = 0; }
  else if (s.scoreHome < s.scoreAway) { leaguePointsHome = 0; leaguePointsAway = 2; }
  else { leaguePointsHome = 1; leaguePointsAway = 1; }

  // DUPLICITA: stejná dvojice týmů v rámci liga+season+round jen jednou
  const [a, b] = [homeTeam, awayTeam].sort();
  const pairKey = `${a}_${b}`;
  const matchId = `m_${liga}_${SEASON_ID}_${ROUND}_${pairKey}`;

  const data = {
    liga,
    seasonId: SEASON_ID,
    round: ROUND,
    pairKey,

    date,
    homeTeam,
    awayTeam,
    homePlayers,
    awayPlayers,

    sumHome: s.sumHome,
    sumAway: s.sumAway,

    scoreHomeBase: s.scoreHomeBase,
    scoreAwayBase: s.scoreAwayBase,

    bonusScoreHome: s.bonusScoreHome,
    bonusScoreAway: s.bonusScoreAway,

    scoreHome: s.scoreHome,
    scoreAway: s.scoreAway,

    leaguePointsHome,
    leaguePointsAway,

    createdAt: Timestamp.now()
  };

  try{
    // setDoc na deterministické ID:
    // - první uložení = CREATE (povoleno)
    // - druhé uložení = UPDATE stejného docu (zakázáno hráčům) => permission-denied
    await setDoc(doc(db, "matches", matchId), data);

    alert("✅ Zápas byl uložen.");

    // vyčistit čísla (hráče necháme vybrané)
    [...homeKuzInputs, ...homeBodyInputs, ...awayKuzInputs, ...awayBodyInputs].forEach(i => i.value = "");
    computeSums();

  } catch(e){
    console.error(e);
    if (e?.code === "permission-denied") {
      alert("⚠️ Tento zápas už je v této části sezóny uložen (nelze uložit znovu).");
    } else {
      alert("❌ Nepodařilo se uložit zápas. Podívej se do konzole.");
    }
  }
}

submitBtn.addEventListener("click", saveMatch);

// ----------------------------------------------------
// 7) Tabulka družstev (Skóre, Body, NV týmový výkon)
// ----------------------------------------------------
function computeTeamsTable(matches, liga){
  const ligaTeams = teams.filter(t => Number(t.liga) === Number(liga));

  const stats = {};
  ligaTeams.forEach(t => {
    stats[t.id] = {
      teamId: t.id,
      name: t.name,
      zapasy: 0,

      // kuželky celkem (součet)
      kuzelky: 0,

      // Body do tabulky (2/1/0)
      points: 0,

      // Skóre (vyhrané:prohrané) — s bonusem kuželek
      scoreFor: 0,
      scoreAgainst: 0,

      // NV — max týmový výkon kuželek v jednom zápase
      nv: 0
    };
  });

  matches.forEach(m => {
    const home = stats[m.homeTeam];
    const away = stats[m.awayTeam];
    if (!home || !away) return;

    // domácí
    home.zapasy++;
    home.kuzelky += (m.sumHome || 0);
    home.points += (m.leaguePointsHome || 0);
    home.scoreFor += (m.scoreHome || 0);
    home.scoreAgainst += (m.scoreAway || 0);
    home.nv = Math.max(home.nv, (m.sumHome || 0));

    // hosté
    away.zapasy++;
    away.kuzelky += (m.sumAway || 0);
    away.points += (m.leaguePointsAway || 0);
    away.scoreFor += (m.scoreAway || 0);
    away.scoreAgainst += (m.scoreHome || 0);
    away.nv = Math.max(away.nv, (m.sumAway || 0));
  });

  const rows = Object.values(stats).map(s => ({
    ...s,
    prumer: s.zapasy ? (s.kuzelky / s.zapasy).toFixed(2) : "0.00"
  }));

  // řazení: Body (2/1/0) -> rozdíl skóre -> kuželky
  rows.sort((a,b)=>{
    if (b.points !== a.points) return b.points - a.points;
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
      <th>Poř</th>
      <th>Družstvo</th>
      <th>Celkem</th>
      <th>Zápasy</th>
      <th>Průměr</th>
      <th>Skóre</th>
      <th>Body</th>
      <th>NV</th>
    </tr>`;

  rows.forEach((r,i)=>{
    html += `<tr>
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td>${r.kuzelky}</td>
      <td>${r.zapasy}</td>
      <td>${r.prumer}</td>
      <td>${r.scoreFor}:${r.scoreAgainst}</td>
      <td>${r.points}</td>
      <td>${r.nv}</td>
    </tr>`;
  });

  html += `</table>`;
  tabDruzstva.innerHTML = html;
}

// ----------------------------------------------------
// 8) Tabulka hráčů (individuální body bez bonusu kuželek)
// ----------------------------------------------------
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
    ps[playerId].body += (body||0);
    ps[playerId].nv = Math.max(ps[playerId].nv, (kuzelky||0));
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
      <th>Poř</th>
      <th>Hráč</th>
      <th>Družstvo</th>
      <th>Celkem</th>
      <th>Zápasy</th>
      <th>Průměr</th>
      <th>Body</th>
      <th>NV</th>
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

// ----------------------------------------------------
// 9) Matice zápasů (jen aktuální fáze)
// ----------------------------------------------------
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

      // Skóre (po bonusu kuželek)
      const scoreA = reversed ? (m.scoreAway||0) : (m.scoreHome||0);
      const scoreB = reversed ? (m.scoreHome||0) : (m.scoreAway||0);

      // Kuželky
      const kuzA = reversed ? (m.sumAway||0) : (m.sumHome||0);
      const kuzB = reversed ? (m.sumHome||0) : (m.sumAway||0);

      html += `<td style="text-align:center;">
        <div style="font-weight:bold;color:#ffd700;">${scoreA} : ${scoreB}</div>
        <div style="font-size:12px;opacity:0.9;">${kuzA} : ${kuzB}</div>
      </td>`;
    });

    html += `</tr>`;
  });

  html += `</table></div>`;
  tabMatice.innerHTML = html;
}

// ----------------------------------------------------
// 10) Listenery na matches
// - totals: celá sezóna (autumn + spring) => tabulky
// - phase:  jen aktuální phase => matice
// ----------------------------------------------------
function listenActiveSeason(onReady){
  const q = query(
    collection(db, "seasons"),
    where("isActive", "==", true),
    limit(1)
  );

  onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        console.warn("⚠️ Nenalezena aktivní sezóna v seasons (isActive=true).");
        seasonReady = false;
        submitBtn.disabled = true;
        return;
      }

      const d = snap.docs[0];
      const s = { id: d.id, ...d.data() };

      const newSeason = s.id;
      
const newRound = Number(s.activeRound || 1);
const changed = (SEASON_ID !== s.id) || (ROUND !== newRound);
      
SEASON_ID = s.id;
ROUND = newRound;

seasonReady = true;
submitBtn.disabled = false;

console.log("✅ Aktivní sezóna/kolo:", SEASON_ID, ROUND);

if (changed) {
  startMatchListeners();
  renderAll(Number(ligaSelect.value || 1));
}
      
      // --- Zobrazení sezóny a fáze v nadpisu ---
if (seasonBadge) {
  const label = s.label || SEASON_ID;   // např. 2025/2026
  seasonBadge.textContent = `(${label} – kolo ${ROUND})`;
}


      seasonReady = true;
      submitBtn.disabled = false;

      console.log("✅ Aktivní sezóna/fáze:", SEASON_ID, ROUND);

      if (changed) {
        startMatchListeners();
        renderAll(Number(ligaSelect.value || 1));
      }

      onReady?.();
    },
    (err) => {
      console.error("❌ seasons read error:", err);
      seasonReady = false;
      submitBtn.disabled = true;
    }
  );
}


function listenTotals(liga){
  const q = query(
    collection(db, "matches"),
    where("liga", "==", Number(liga)),
    where("seasonId", "==", SEASON_ID)
  );

  onSnapshot(q, snap=>{
    totalsCache[liga] = snap.docs.map(d => d.data());
    if (Number(ligaSelect.value) === Number(liga)){
      renderAll(Number(liga));
    }
  });
}
function listenPhase(liga) {
  const q = query(
    collection(db, "matches"),
    where("liga", "==", Number(liga)),
    where("seasonId", "==", SEASON_ID),
    where("round", "==", ROUND)
  );

  onSnapshot(
    q,
    (snap) => {
      phaseCache[liga] = snap.docs.map(d => d.data());
      if (Number(ligaSelect.value) === Number(liga)) {
        renderAll(Number(liga));
      }
    },
    (err) => {
      console.error("❌ phase matches snapshot error:", err);
    }
  );
}

// ----------------------------------------------------
// Init
// ----------------------------------------------------
window.addEventListener("DOMContentLoaded", async ()=>{
  try{
    submitBtn.disabled = true;

    await loadTeams();
    await loadPlayers();

    listenActiveSeason(() => {
      if (seasonReady){
        startMatchListeners();
        switchLiga("1");
        computeSums();
      }
    });
  } catch(e){
    console.error(e);
    alert("Nepodařilo se načíst data Habaďůry. Podívej se do konzole.");
  }
});


