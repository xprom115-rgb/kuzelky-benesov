import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const SEASON_ID = params.get("season");
const PHASE = params.get("phase"); // autumn | spring | final

const badgeEl = document.getElementById("histBadge");
const btnLiga1 = document.getElementById("btn-liga1");
const btnLiga2 = document.getElementById("btn-liga2");

const tabDruzstva = document.getElementById("tab-druzstva");
const tabHracu = document.getElementById("tab-hracu");
const tabMatice = document.getElementById("tab-matice");

let teams = [];
let players = [];
let currentLiga = 1;

let matchesL1 = [];
let matchesL2 = [];

function csCompare(a,b){ return (a||"").localeCompare(b||"","cs"); }
function phaseText(p){
  if (p === "spring") return "jaro";
  if (p === "final") return "finální";
  return "podzim";
}

function setLiga(liga){
  currentLiga = Number(liga);
  btnLiga1.classList.toggle("active", currentLiga === 1);
  btnLiga2.classList.toggle("active", currentLiga === 2);
  renderAll();
}

function teamName(id){
  return teams.find(t=>t.id===id)?.name || "(tým?)";
}

function showEmpty(msg){
  tabDruzstva.innerHTML = `<p><em>${msg}</em></p>`;
  tabHracu.innerHTML = "";
  tabMatice.innerHTML = "";
}

// ---------- TABULKA DRUŽSTEV ----------
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

    home.zapasy++;
    home.kuzelky += (m.sumHome||0);
    home.points += (m.leaguePointsHome||0);
    home.scoreFor += (m.scoreHome||0);
    home.scoreAgainst += (m.scoreAway||0);
    home.nv = Math.max(home.nv, (m.sumHome||0)); // ✅ max z obou částí, pokud je matches obsahují

    away.zapasy++;
    away.kuzelky += (m.sumAway||0);
    away.points += (m.leaguePointsAway||0);
    away.scoreFor += (m.scoreAway||0);
    away.scoreAgainst += (m.scoreHome||0);
    away.nv = Math.max(away.nv, (m.sumAway||0));
  });

  const rows = Object.values(stats).map(s=>({
    ...s,
    prumerNum: s.zapasy ? (s.kuzelky/s.zapasy) : 0,
    prumer: s.zapasy ? (s.kuzelky/s.zapasy).toFixed(2) : "0.00"
  }));

  rows.sort((a,b)=>{
    if (b.points !== a.points) return b.points - a.points;
    const diff = (b.scoreFor-b.scoreAgainst) - (a.scoreFor-a.scoreAgainst);
    if (diff !== 0) return diff;
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

// ---------- TABULKA HRÁČŮ (ŘAZENÍ PODLE PRŮMĚRU) ----------
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

  // ✅ řazení primárně podle průměru (desc)
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

// ---------- MATICE ----------
function buildMatchMap(matches){
  const map = new Map();
  matches.forEach(m=> map.set(`${m.homeTeam}-${m.awayTeam}`, m));
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

function renderAll(){
  const matches = (currentLiga === 1) ? matchesL1 : matchesL2;

  if (!matches.length){
    showEmpty(`V sezóně ${SEASON_ID} (${phaseText(PHASE)}) zatím nejsou zápasy pro ${currentLiga}. ligu.`);
    return;
  }

  renderTeamsTable(matches, currentLiga);
  renderPlayersTable(matches, currentLiga);
  renderMatrix(matches, currentLiga);
}

async function loadBase(){
  const ts = await getDocs(collection(db,"teams"));
  teams = ts.docs.map(d=>({id:d.id, ...d.data()}));
  const ps = await getDocs(collection(db,"players"));
  players = ps.docs.map(d=>({id:d.id, ...d.data()}));
}

async function init(){
  if (!SEASON_ID || !PHASE){
    showEmpty("Chybí parametry season/phase v URL.");
    return;
  }

  badgeEl.textContent = `(${SEASON_ID} – ${phaseText(PHASE)})`;

  await loadBase();

  // ✅ vždy načteme všechny zápasy pro sezónu a pak filtrujeme fázi v JS
  const qAllSeason = query(
    collection(db,"matches"),
    where("seasonId","==", SEASON_ID)
  );

  onSnapshot(qAllSeason, snap=>{
    const allSeason = snap.docs.map(d=>d.data());

    // filtr fáze
    const filtered = (PHASE === "final")
      ? allSeason.filter(m => m.phase === "autumn" || m.phase === "spring")
      : allSeason.filter(m => m.phase === PHASE);

    matchesL1 = filtered.filter(m => Number(m.liga) === 1);
    matchesL2 = filtered.filter(m => Number(m.liga) === 2);

    renderAll();
  });

  btnLiga1.addEventListener("click", ()=> setLiga(1));
  btnLiga2.addEventListener("click", ()=> setLiga(2));

  setLiga(1);
  renderAll();
}

init();
