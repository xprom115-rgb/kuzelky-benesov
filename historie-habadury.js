import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const SEASON_ID = params.get("season");
const PHASE = params.get("phase"); // autumn | spring

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
function sumArray(arr){ return arr.reduce((a,b)=>a+b,0); }
function phaseText(p){ return p === "spring" ? "jaro" : "podzim"; }

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
    home.nv = Math.max(home.nv, (m.sumHome||0));

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
