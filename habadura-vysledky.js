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

