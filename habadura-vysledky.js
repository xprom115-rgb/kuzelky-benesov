import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// URL: habadura-vysledky.html?season=2025-2026&round=1|2|3|final
const params = new URLSearchParams(location.search);
const SEASON_ID = params.get("season");
const ROUND_PARAM = params.get("round") || "1"; // "1" | "2" | "3" | "final"

const badgeEl = document.getElementById("histBadge");
const btnLiga1 = document.getElementById("btn-liga1");
const btnLiga2 = document.getElementById("btn-liga2");

const tabDruzstva = document.getElementById("tab-druzstva");
const tabHracu = document.getElementById("tab-hracu");
const tabMatice = document.getElementById("tab-matice");

// volitelné – pokud máš v HTML wrapper pro matici:
const maticeSection = document.getElementById("maticeSection");

let teams = [];
let players = [];
let currentLiga = 1;

// data z archivu (už vyfiltrované pro aktuální výběr kol)
let matchesL1 = [];
let matchesL2 = [];

// unsub funkce pro snapshoty
let unsubs = [];

function csCompare(a, b) { return (a || "").localeCompare(b || "", "cs"); }

function roundText(r) {
  if (r === "final") return "finální";
  return `kolo ${r}`;
}

function setLiga(liga) {
  currentLiga = Number(liga);
  btnLiga1.classList.toggle("active", currentLiga === 1);
  btnLiga2.classList.toggle("active", currentLiga === 2);
  renderAll();
}

function teamName(id) {
  return teams.find(t => t.id === id)?.name || "(tým?)";
}

function showEmpty(msg) {
  tabDruzstva.innerHTML = `<p><em>${msg}</em></p>`;
  tabHracu.innerHTML = "";
  tabMatice.innerHTML = "";
}

function hideMatrixIfFinal() {
  if (ROUND_PARAM === "final") {
    if (maticeSection) maticeSection.style.display = "none";
    if (tabMatice) tabMatice.innerHTML = "";
  } else {
    if (maticeSection) maticeSection.style.display = "";
  }
}

// ======================
// TABULKA DRUŽSTEV
// ======================
function computeTeamsTable(matches, liga) {
  const ligaTeams = teams.filter(t => Number(t.liga) === Number(liga));
  const stats = {};
  ligaTeams.forEach(t => {
    stats[t.id] = { name: t.name, zapasy: 0, kuzelky: 0, points: 0, scoreFor: 0, scoreAgainst: 0, nv: 0 };
  });

  matches.forEach(m => {
    const home = stats[m.homeTeam];
    const away = stats[m.awayTeam];
    if (!home || !away) return;

    home.zapasy++;
    home.kuzelky += (m.sumHome || 0);
    home.points += (m.leaguePointsHome || 0);
    home.scoreFor += (m.scoreHome || 0);
    home.scoreAgainst += (m.scoreAway || 0);
    home.nv = Math.max(home.nv, (m.sumHome || 0)); // ✅ max napříč koly = nejlepší výkon z obou částí

    away.zapasy++;
    away.kuzelky += (m.sumAway || 0);
    away.points += (m.leaguePointsAway || 0);
    away.scoreFor += (m.scoreAway || 0);
    away.scoreAgainst += (m.scoreHome || 0);
    away.nv = Math.max(away.nv, (m.sumAway || 0));
  });

  const rows = Object.values(stats).map(s => ({
    ...s,
    prumerNum: s.zapasy ? (s.kuzelky / s.zapasy) : 0,
    prumer: s.zapasy ? (s.kuzelky / s.zapasy).toFixed(2) : "0.00"
  }));

  // řazení: body 2/1/0 -> rozdíl skóre -> kuželky
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diff = (b.scoreFor - b.scoreAgainst) - (a.scoreFor - a.scoreAgainst);
    if (diff !== 0) return diff;
    return b.kuzelky - a.kuzelky;
  });

  return rows;
}

function renderTeamsTable(matches, liga) {
  const rows = computeTeamsTable(matches, liga);
  let html = `<table class="tabulka">
    <tr><th>Poř</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Skóre</th><th>Body</th><th>NV</th></tr>`;
  rows.forEach((r, i) => {
    html += `<tr>
      <td>${i + 1}</td><td>${r.name}</td><td>${r.kuzelky}</td><td>${r.zapasy}</td>
      <td>${r.prumer}</td><td>${r.scoreFor}:${r.scoreAgainst}</td><td>${r.points}</td><td>${r.nv}</td>
    </tr>`;
  });
  html += `</table>`;
  tabDruzstva.innerHTML = html;
}

// ======================
// TABULKA HRÁČŮ (řazení podle průměru)
// ======================
function computePlayersTable(matches, liga) {
  const ps = {};

  function addLine(playerId, kuzelky, body) {
    const pl = players.find(x => x.id === playerId);
    if (!pl) return;
    if (Number(pl.liga) !== Number(liga)) return;

    if (!ps[playerId]) ps[playerId] = { name: pl.name, teamId: pl.teamId, zapasy: 0, kuzelky: 0, body: 0, nv: 0 };
    ps[playerId].zapasy++;
    ps[playerId].kuzelky += (kuzelky || 0);
    ps[playerId].body += (body || 0);
    ps[playerId].nv = Math.max(ps[playerId].nv, (kuzelky || 0));
  }

  matches.forEach(m => {
    (m.homePlayers || []).forEach(p => addLine(p.playerId, p.kuzelky, p.body));
    (m.awayPlayers || []).forEach(p => addLine(p.playerId, p.kuzelky, p.body));
  });

  const rows = Object.values(ps).map(r => ({
    ...r,
    teamName: teamName(r.teamId),
    prumerNum: r.zapasy ? (r.kuzelky / r.zapasy) : 0,
    prumer: r.zapasy ? (r.kuzelky / r.zapasy).toFixed(2) : "0.00"
  }));

  // ✅ primárně průměr desc
  rows.sort((a, b) => {
    if (b.prumerNum !== a.prumerNum) return b.prumerNum - a.prumerNum;
    if (b.nv !== a.nv) return b.nv - a.nv;
    if (b.kuzelky !== a.kuzelky) return b.kuzelky - a.kuzelky;
    return csCompare(a.name, b.name);
  });

  return rows;
}

function renderPlayersTable(matches, liga) {
  const rows = computePlayersTable(matches, liga);
  let html = `<table class="tabulka">
    <tr><th>Poř</th><th>Hráč</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Body</th><th>NV</th></tr>`;
  rows.forEach((r, i) => {
    html += `<tr>
      <td>${i + 1}</td><td>${r.name}</td><td>${r.teamName}</td><td>${r.kuzelky}</td>
      <td>${r.zapasy}</td><td>${r.prumer}</td><td>${r.body}</td><td>${r.nv}</td>
    </tr>`;
  });
  html += `</table>`;
  tabHracu.innerHTML = html;
}

// ======================
// MATICE (jen pro kolo 1/2/3, ne pro finále)
// ======================
function buildMatchMap(matches) {
  const map = new Map();
  matches.forEach(m => map.set(`${m.homeTeam}-${m.awayTeam}`, m));
  return map;
}

function renderMatrix(matches, liga) {
  if (ROUND_PARAM === "final") return;

  const ligaTeams = teams
    .filter(t => Number(t.liga) === Number(liga))
    .sort((a, b) => csCompare(a.name, b.name));

  const map = buildMatchMap(matches);

  let html = `<div style="overflow:auto;"><table class="tabulka" style="min-width:900px;">
    <tr><th style="position:sticky;left:0;z-index:2;">Družstvo</th>${ligaTeams.map(t => `<th>${t.name}</th>`).join("")}</tr>`;

  ligaTeams.forEach(rowT => {
    html += `<tr><th style="position:sticky;left:0;z-index:1;">${rowT.name}</th>`;
    ligaTeams.forEach(colT => {
      if (rowT.id === colT.id) {
        html += `<td style="background:rgba(255,255,255,0.12);text-align:center;font-weight:bold;">—</td>`;
        return;
      }
      const direct = map.get(`${rowT.id}-${colT.id}`);
      const reverse = map.get(`${colT.id}-${rowT.id}`);
      const m = direct || reverse;
      if (!m) { html += `<td></td>`; return; }

      const reversed = !direct && !!reverse;
      const scoreA = reversed ? (m.scoreAway || 0) : (m.scoreHome || 0);
      const scoreB = reversed ? (m.scoreHome || 0) : (m.scoreAway || 0);
      const kuzA = reversed ? (m.sumAway || 0) : (m.sumHome || 0);
      const kuzB = reversed ? (m.sumHome || 0) : (m.sumAway || 0);

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

function renderAll() {
  hideMatrixIfFinal();

  const matches = (currentLiga === 1) ? matchesL1 : matchesL2;
  if (!matches.length) {
    showEmpty(`V sezóně ${SEASON_ID} (${roundText(ROUND_PARAM)}) zatím nejsou zápasy pro ${currentLiga}. ligu.`);
    return;
  }

  renderTeamsTable(matches, currentLiga);
  renderPlayersTable(matches, currentLiga);
  renderMatrix(matches, currentLiga);
}

// ======================
// Data loading
// ======================
async function loadBase() {
  const ts = await getDocs(collection(db, "teams"));
  teams = ts.docs.map(d => ({ id: d.id, ...d.data() }));

  const ps = await getDocs(collection(db, "players"));
  players = ps.docs.map(d => ({ id: d.id, ...d.data() }));
}

// subscribe to archive round collection
function subscribeRound(seasonId, round, onData) {
  const coll = collection(db, "habadura_history", seasonId, "rounds", String(round), "matches");
  const unsub = onSnapshot(coll, (snap) => {
    const arr = snap.docs.map(d => d.data());
    onData(arr);
  });
  unsubs.push(unsub);
}

// stop all subscriptions
function stopSubs() {
  unsubs.forEach(u => { try { u(); } catch {} });
  unsubs = [];
}

// determine final included rounds by seasons.hasRound3
async function getFinalRounds(seasonId) {
  const sRef = doc(db, "seasons", seasonId);
  const sSnap = await getDoc(sRef);
  const s = sSnap.exists() ? sSnap.data() : null;

  // default: 1+2
  let rounds = [1, 2];
  if (s && s.hasRound3 === true) rounds = [1, 2, 3];

  return { rounds, label: s?.label || seasonId, hasRound3: s?.hasRound3 };
}

async function init() {
  if (!SEASON_ID) {
    showEmpty("Chybí parametr season v URL.");
    return;
  }

  // badge: vezmeme label ze seasons (pokud existuje)
