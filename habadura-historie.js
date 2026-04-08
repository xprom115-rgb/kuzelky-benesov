import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const SEASON_ID = params.get("season");
const PHASE = params.get("phase"); // autumn/spring

const titleEl = document.getElementById("histTitle");
const tabDruzstva = document.getElementById("tab-druzstva");
const tabHracu = document.getElementById("tab-hracu");
const tabMatice = document.getElementById("tab-matice");

let teams = [];
let players = [];
let currentLiga = 1;

function csCompare(a,b){ return (a||"").localeCompare(b||"","cs"); }
function sumArray(arr){ return arr.reduce((a,b)=>a+b,0); }

function teamName(id){ return teams.find(t=>t.id===id)?.name || "(tým?)"; }

// ---- Tabulka družstev (jen tato sezóna+phase) ----
function computeTeamsTable(matches, liga){
  const ligaTeams = teams.filter(t=>Number(t.liga)===Number(liga));
  const stats = {};
  ligaTeams.forEach(t=>{
    stats[t.id] = { name:t.name, zapasy:0, kuzelky:0, points:0, scoreFor:0, scoreAgainst:0, nv:0 };
  });

  matches.forEach(m=>{
    const home = stats[m.homeTeam];
    const away = stats[m.awayTeam];
    if (!home || !away) return;

    home.zapasy++; home.kuzelky += (m.sumHome||0);
    home.points += (m.leaguePointsHome||0);
    home.scoreFor += (m.scoreHome||0);
    home.scoreAgainst += (m.scoreAway||0);
    home.nv = Math.max(home.nv, (m.sumHome||0));

    away.zapasy++; away.kuzelky += (m.sumAway||0);
    away.points += (m.leaguePointsAway||0);
    away.scoreFor += (m.scoreAway||0);
    away.scoreAgainst += (m.scoreHome||0);
    away.nv = Math.max(away.nv, (m.sumAway||0));
  });

  const rows = Object.values(stats).map(s=>({
    ...s,
    prumer: s.zapasy ? (s.kuzelky/s.zapasy).toFixed(2) : "0.00"
  }));

  rows.sort((a,b)=>{
    if (b.points !== a.points) return b.points - a.points;
    const diff = (b.scoreFor-b.scoreAgainst) - (a.scoreFor-a.scoreAgainst);
    if (diff!==0) return diff;
    return b.kuzelky - a.kuzelky;
  });

  return rows;
}

function renderTeamsTable(matches, liga){
  const rows = computeTeamsTable(matches, liga);
  let html = `<table class="tabulka">
    <tr><th>Poř</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Skóre</th><th>Body</th><th>NV</th></tr>`;
  rows.forEach((r,i)=>{
    html += `<tr>
      <td>${i+1}</td><td>${r.name}</td><td>${r.kuzelky}</td><td>${r.zapasy}</td>
      <td>${r.prumer}</td><td>${r.scoreFor}:${r.scoreAgainst}</td><td>${r.points}</td><td>${r.nv}</td>
    </tr>`;
  });
  html += `</table>`;
  tabDruzstva.innerHTML = html;
}

// ---- Tabulka hráčů: řazení primárně podle průměru ----
function computePlayersTable(matches, liga){
  const ps = {};

  function addLine(playerId, kuzelky, body){
    const pl = players.find(x=>x.id===playerId);
    if (!pl) return;
    if (Number(pl.liga)!==Number(liga)) return;

    if (!ps[playerId]) ps[playerId] = { name:pl.name, teamId:pl.teamId, zapasy:0, kuzelky:0, body:0, nv:0 };
    ps[playerId].zapasy++;
    ps[playerId].kuzelky += (kuzelky||0);
    ps[playerId].body += (body||0);
    ps[playerId].nv = Math.max(ps[playerId].nv, (kuzelky||0));
  }

  matches.forEach(m=>{
    (m.homePlayers||[]).forEach(p=>addLine(p.playerId, p.kuzelky, p.body));
    (m.awayPlayers||[]).forEach(p=>addLine(p.playerId, p.kuzelky, p.body));
  });

  const rows = Object.values(ps).map(r=>({
    ...r,
    teamName: teamName(r.teamId),
    prumerNum: r.zapasy ? (r.kuzelky/r.zapasy) : 0,
    prumer: r.zapasy ? (r.kuzelky/r.zapasy).toFixed(2) : "0.00"
  }));

  // ✅ řazení podle průměru (desc), potom NV, potom celkem kuželky, potom jméno
  rows.sort((a,b)=>{
    if (b.prumerNum !== a.prumerNum) return b.prumerNum - a.prumerNum;
    if (b.nv !== a.nv) return b.nv - a.nv;
    if (b.kuzelky !== a.kuzelky) return b.kuzelky - a.kuzelky;
    return csCompare(a.name, b.name);
  });

  return rows;
}

function renderPlayersTable(matches, liga){
  const rows = computePlayersTable(matches, liga);
  let html = `<table class="tabulka">
    <tr><th>Poř</th><th>Hráč</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Body</th><th>NV</th></tr>`;
  rows.forEach((r,i)=>{
    html += `<tr>
      <td>${i+1}</td><td>${r.name}</td><td>${r.teamName}</td><td>${r.kuzelky}</td>
      <td>${r.zapasy}</td><td>${r.prumer}</td><td>${r.body}</td><td>${r.nv}</td>
    </tr>`;
  });
  html += `</table>`;
  tabHracu.innerHTML = html;
}

// ---- Matice zápasů ----
function buildMatchMap(matches){
  const map = new Map();
  matches.forEach(m=>{
    map.set(`${m.homeTeam}-${m.awayTeam}`, m);
  });
  return map;
}

function renderMatrix(matches, liga){
  const ligaTeams = teams.filter(t=>Number(t.liga)===Number(liga)).sort((a,b)=>csCompare(a.name,b.name));
  const map = buildMatchMap(matches);

  let html = `<div style="overflow:auto;"><table class="tabulka" style="min-width:900px;">
    <tr><th style="position:sticky;left:0;z-index:2;">Družstvo</th>${ligaTeams.map(t=>`<th>${t.name}</th>`).join("")}</tr>`;

  ligaTeams.forEach(rowT=>{
    html += `<tr><th style="position:sticky;left:0;z-index:1;">${rowT.name}</th>`;
    ligaTeams.forEach(colT=>{
      if (rowT.id===colT.id){
        html += `<td style="background:rgba(255,255,255,0.12);text-align:center;font-weight:bold;">—</td>`;
        return;
      }
      const direct = map.get(`${rowT.id}-${colT.id}`);
      const reverse = map.get(`${colT.id}-${rowT.id}`);
      const m = direct || reverse;
      if (!m){ html += `<td></td>`; return; }
      const reversed = !direct && !!reverse;

      const scoreA = reversed ? (m.scoreAway||0) : (m.scoreHome||0);
      const scoreB = reversed ? (m.scoreHome||0) : (m.scoreAway||0);
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

// ---- init ----
async function loadBase(){
  const ts = await getDocs(collection(db,"teams"));
  teams = ts.docs.map(d=>({id:d.id, ...d.data()}));
  const ps = await getDocs(collection(db,"players"));
  players = ps.docs.map(d=>({id:d.id, ...d.data()}));
}

function setTitle(){
  const phaseText = PHASE === "spring" ? "jaro" : "podzim";
  titleEl.textContent = `Habaďůra – ${SEASON_ID} (${phaseText})`;
}

function listenMatches(){
  if (!SEASON_ID || !PHASE) {
    tabDruzstva.innerHTML = "<p><em>Chybí season/phase v URL.</em></p>";
    return;
  }
  setTitle();

  // načti jen konkrétní season+phase (kompletní výsledky dané části)
  const q1 = query(collection(db,"matches"),
    where("seasonId","==", SEASON_ID),
    where("phase","==", PHASE),
    where("liga","==", 1)
  );
  const q2 = query(collection(db,"matches"),
    where("seasonId","==", SEASON_ID),
    where("phase","==", PHASE),
    where("liga","==", 2)
  );

  let m1 = [], m2 = [];

  onSnapshot(q1, snap=>{
    m1 = snap.docs.map(d=>d.data());
    if (currentLiga===1){
      renderTeamsTable(m1,1);
      renderPlayersTable(m1,1);
      renderMatrix(m1,1);
    }
  });

  onSnapshot(q2, snap=>{
    m2 = snap.docs.map(d=>d.data());
    if (currentLiga===2){
      renderTeamsTable(m2,2);
      renderPlayersTable(m2,2);
      renderMatrix(m2,2);
    }
  });

  // default liga 1
  currentLiga = 1;
  renderTeamsTable(m1,1);
  renderPlayersTable(m1,1);
  renderMatrix(m1,1);
}

(async ()=>{
  await loadBase();
  listenMatches();
})();
