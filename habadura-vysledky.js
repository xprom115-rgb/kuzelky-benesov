import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

/**
 * URL:
 *  habadura-vysledky.html?season=2025-2026&round=1
 *  habadura-vysledky.html?season=2025-2026&round=2
 *  habadura-vysledky.html?season=2025-2026&round=3
 *  habadura-vysledky.html?season=2025-2026&round=final
 */

const params = new URLSearchParams(location.search);
const SEASON_ID = params.get("season");
const ROUND_PARAM = (params.get("round") || "1").toLowerCase(); // "1"|"2"|"3"|"final"

// DOM
const badgeEl = document.getElementById("histBadge");
const btnLiga1 = document.getElementById("btn-liga1");
const btnLiga2 = document.getElementById("btn-liga2");

const tabDruzstva = document.getElementById("tab-druzstva");
const tabHracu = document.getElementById("tab-hracu");
const tabMatice = document.getElementById("tab-matice");
const maticeSection = document.getElementById("maticeSection");

// state
let teams = [];
let players = [];
let currentLiga = 1;

let matchesL1 = [];
let matchesL2 = [];

// unsub snapshoty
let unsubs = [];

// ---------- helpers ----------
function csCompare(a, b) { return (a || "").localeCompare(b || "", "cs"); }

function roundText(r) {
  if (r === "final") return "finální";
  return `kolo ${r}`;
}

function setLiga(liga) {
  currentLiga = Number(liga);
  if (btnLiga1) btnLiga1.classList.toggle("active", currentLiga === 1);
  if (btnLiga2) btnLiga2.classList.toggle("active", currentLiga === 2);
  renderAll();
}

function teamName(id) {
  return teams.find(t => t.id === id)?.name || "(tým?)";
}

function showEmpty(msg) {
  if (tabDruzstva) tabDruzstva.innerHTML = `<p><em>${msg}</em></p>`;
  if (tabHracu) tabHracu.innerHTML = "";
  if (tabMatice) tabMatice.innerHTML = "";
}

/**
 * VARIANTA B:
 * - ve finále matici pouze schováme na obrazovce (CSS class),
 * - ale necháme ji normálně v DOM a normálně ji renderujeme (kvůli tisku).
 */
function toggleMatrixVisibility() {
  if (!maticeSection) return;

  if (ROUND_PARAM === "final") {
    maticeSection.classList.add("hide-on-screen");     // skryje na obrazovce
  } else {
    maticeSection.classList.remove("hide-on-screen");  // zobrazí normálně
  }
}

function stopSubs() {
  for (const u of unsubs) {
    try { u(); } catch {}
  }
  unsubs = [];
}

// ---------- tabulka družstev ----------
function computeTeamsTable(matches, liga) {
  const ligaTeams = teams.filter(t => Number(t.liga) === Number(liga));
  const stats = {};
  ligaTeams.forEach(t => {
    stats[t.id] = {
      name: t.name,
      zapasy: 0,
      kuzelky: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      nv: 0
    };
  });

  for (const m of matches) {
    const home = stats[m.homeTeam];
    const away = stats[m.awayTeam];
    if (!home || !away) continue;

    home.zapasy++;
    home.kuzelky += (m.sumHome || 0);
    home.points += (m.leaguePointsHome || 0);
    home.scoreFor += (m.scoreHome || 0);
    home.scoreAgainst += (m.scoreAway || 0);
    home.nv = Math.max(home.nv, (m.sumHome || 0)); // max napříč koly = nejlepší výkon

    away.zapasy++;
    away.kuzelky += (m.sumAway || 0);
    away.points += (m.leaguePointsAway || 0);
    away.scoreFor += (m.scoreAway || 0);
    away.scoreAgainst += (m.scoreHome || 0);
    away.nv = Math.max(away.nv, (m.sumAway || 0));
  }

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
    <tr>
      <th>Poř</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Skóre</th><th>Body</th><th>NV</th>
    </tr>`;

  rows.forEach((r, i) => {
    html += `<tr>
      <td>${i + 1}</td>
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

// ---------- tabulka hráčů (řazení podle průměru) ----------
function computePlayersTable(matches, liga) {
  const ps = {};

  function addLine(playerId, kuzelky, body) {
    const pl = players.find(x => x.id === playerId);
    if (!pl) return;
    if (Number(pl.liga) !== Number(liga)) return;

    if (!ps[playerId]) {
      ps[playerId] = { name: pl.name, teamId: pl.teamId, zapasy: 0, kuzelky: 0, body: 0, nv: 0 };
    }

    ps[playerId].zapasy++;
    ps[playerId].kuzelky += (kuzelky || 0);
    ps[playerId].body += (body || 0);
    ps[playerId].nv = Math.max(ps[playerId].nv, (kuzelky || 0));
  }

  for (const m of matches) {
    (m.homePlayers || []).forEach(p => addLine(p.playerId, p.kuzelky, p.body));
    (m.awayPlayers || []).forEach(p => addLine(p.playerId, p.kuzelky, p.body));
  }

  const rows = Object.values(ps).map(r => ({
    ...r,
    teamName: teamName(r.teamId),
    prumerNum: r.zapasy ? (r.kuzelky / r.zapasy) : 0,
    prumer: r.zapasy ? (r.kuzelky / r.zapasy).toFixed(2) : "0.00"
  }));

  // ✅ primárně podle průměru (desc)
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
    <tr>
      <th>Poř</th><th>Hráč</th><th>Družstvo</th><th>Celkem</th><th>Zápasy</th><th>Průměr</th><th>Body</th><th>NV</th>
    </tr>`;

  rows.forEach((r, i) => {
    html += `<tr>
      <td>${i + 1}</td>
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

// ---------- matice ----------
function buildMatchMap(matches) {
  const map = new Map();
  matches.forEach(m => map.set(`${m.homeTeam}-${m.awayTeam}`, m));
  return map;
}

function renderMatrix(matches, liga) {
  if (!tabMatice) return;

  const ligaTeams = teams
    .filter(t => Number(t.liga) === Number(liga))
    .sort((a, b) => csCompare(a.name, b.name));

  const map = buildMatchMap(matches);

  let html = `<div style="overflow:auto;"><table class="tabulka" style="min-width:900px;">
    <tr>
      <th style="position:sticky;left:0;z-index:2;">Družstvo</th>
      ${ligaTeams.map(t => `<th>${t.name}</th>`).join("")}
    </tr>`;

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

// ---------- render ----------
function renderAll() {
  toggleMatrixVisibility();

  const matches = (currentLiga === 1) ? matchesL1 : matchesL2;

  if (!matches.length) {
    showEmpty(`V sezóně ${SEASON_ID} (${roundText(ROUND_PARAM)}) zatím nejsou zápasy pro ${currentLiga}. ligu.`);
    return;
  }

  renderTeamsTable(matches, currentLiga);
  renderPlayersTable(matches, currentLiga);

  // ✅ Renderujeme matici VŽDY (i ve finále), jen je na obrazovce skrytá CSS třídou
  renderMatrix(matches, currentLiga);
}

// ---------- data load ----------
async function loadBase() {
  const ts = await getDocs(collection(db, "teams"));
  teams = ts.docs.map(d => ({ id: d.id, ...d.data() }));

  const ps = await getDocs(collection(db, "players"));
  players = ps.docs.map(d => ({ id: d.id, ...d.data() }));
}

function subscribeArchiveRound(seasonId, round, onData) {
  const collRef = collection(db, "habadura_history", seasonId, "rounds", String(round), "matches");
  const unsub = onSnapshot(collRef, (snap) => {
    const arr = snap.docs.map(d => d.data());
    onData(arr);
  });
  unsubs.push(unsub);
}

async function getSeasonInfo(seasonId) {
  const sRef = doc(db, "seasons", seasonId);
  const sSnap = await getDoc(sRef);
  if (!sSnap.exists()) return null;
  return sSnap.data();
}

// ---------- init ----------
async function init() {
  if (!SEASON_ID) {
    showEmpty("Chybí parametr season v URL.");
    return;
  }

  // liga tlačítka
  if (btnLiga1) btnLiga1.addEventListener("click", () => setLiga(1));
  if (btnLiga2) btnLiga2.addEventListener("click", () => setLiga(2));
  setLiga(1);

  // načti teams/players
  await loadBase();

  // načti seasons info (label + finální ochrana + hasRound3)
  const sInfo = await getSeasonInfo(SEASON_ID);
  const label = sInfo?.label || SEASON_ID;

  if (badgeEl) badgeEl.textContent = `(${label} – ${roundText(ROUND_PARAM)})`;

  // ochrana finále
  if (ROUND_PARAM === "final") {
    if (!sInfo || sInfo.finalPublished !== true) {
      showEmpty("Finální výsledky ještě nejsou zveřejněné.");
      return;
    }
  }

  // stop starých snapshotů
  stopSubs();

  if (ROUND_PARAM === "final") {
    // finále = spojení kol 1+2 nebo 1+2+3 podle hasRound3
    const rounds = (sInfo?.hasRound3 === true) ? [1, 2, 3] : [1, 2];

    // map round -> array
    const roundData = {};
    rounds.forEach(r => { roundData[r] = []; });

    const recomputeMerged = () => {
      const all = [];
      rounds.forEach(r => {
        const arr = roundData[r];
        if (Array.isArray(arr)) all.push(...arr);
      });
      matchesL1 = all.filter(m => Number(m.liga) === 1);
      matchesL2 = all.filter(m => Number(m.liga) === 2);
      renderAll();
    };

    rounds.forEach(r => {
      subscribeArchiveRound(SEASON_ID, r, (arr) => {
        roundData[r] = arr;
        recomputeMerged();
      });
    });

  } else {
    // konkrétní kolo 1/2/3
    const r = Number(ROUND_PARAM);
    subscribeArchiveRound(SEASON_ID, r, (arr) => {
      matchesL1 = arr.filter(m => Number(m.liga) === 1);
      matchesL2 = arr.filter(m => Number(m.liga) === 2);
      renderAll();
    });
  }

  renderAll();
}

init();
