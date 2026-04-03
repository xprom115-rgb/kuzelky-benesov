// habadura.js (MINIMÁLNÍ – přepínání lig + týmy + hráči)
// ------------------------------------------------------
// Požadavky Firestore:
//  - kolekce "teams": { name: string, liga: number }
//  - kolekce "players": { name: string, liga: number, teamId: string }
//
// HTML prvky musí existovat:
//  - #btn-liga1, #btn-liga2, #liga-select
//  - #team-home, #team-away
//  - .home-player (3x), .away-player (3x)

import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ habadura.js načten (minimální verze)");

// DOM
const btnLiga1 = document.getElementById("btn-liga1");
const btnLiga2 = document.getElementById("btn-liga2");
const ligaSelect = document.getElementById("liga-select");

const teamHome = document.getElementById("team-home");
const teamAway = document.getElementById("team-away");

const homePlayerSelects = document.querySelectorAll(".home-player");
const awayPlayerSelects = document.querySelectorAll(".away-player");

// Data cache
let teams = [];
let players = [];

// Helpers
function setLigaButtons(liga) {
  btnLiga1.classList.toggle("active", String(liga) === "1");
  btnLiga2.classList.toggle("active", String(liga) === "2");
  ligaSelect.value = String(liga);
}

function makeOption(value, text) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = text;
  return opt;
}

function fillTeamSelects(liga) {
  const ligaNum = Number(liga);
  const ligaTeams = teams
    .filter(t => Number(t.liga) === ligaNum)
    .sort((a,b) => (a.name || "").localeCompare(b.name || "", "cs"));

  teamHome.innerHTML = "";
  teamAway.innerHTML = "";

  ligaTeams.forEach(t => {
    teamHome.appendChild(makeOption(t.id, t.name));
    teamAway.appendChild(makeOption(t.id, t.name));
  });

  // Pokud jsou alespoň 2 týmy, nastav hosty na jiný tým než domácí
  if (ligaTeams.length >= 2) {
    teamAway.value = ligaTeams[1].id;
  }

  fillPlayerSelects(); // navázat hráče podle týmů
}

function fillPlayerSelects() {
  const homeTeamId = teamHome.value;
  const awayTeamId = teamAway.value;

  const homePlayers = players
    .filter(p => p.teamId === homeTeamId)
    .sort((a,b) => (a.name || "").localeCompare(b.name || "", "cs"));

  const awayPlayers = players
    .filter(p => p.teamId === awayTeamId)
    .sort((a,b) => (a.name || "").localeCompare(b.name || "", "cs"));

  // Naplnit domácí hráče (3 roletky)
  homePlayerSelects.forEach(sel => {
    sel.innerHTML = "";
    if (homePlayers.length === 0) {
      sel.appendChild(makeOption("", "— žádní hráči —"));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    homePlayers.forEach(p => sel.appendChild(makeOption(p.id, p.name)));
  });

  // Naplnit hosty hráče (3 roletky)
  awayPlayerSelects.forEach(sel => {
    sel.innerHTML = "";
    if (awayPlayers.length === 0) {
      sel.appendChild(makeOption("", "— žádní hráči —"));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    awayPlayers.forEach(p => sel.appendChild(makeOption(p.id, p.name)));
  });
}

function switchLiga(liga) {
  console.log("➡️ Přepínám ligu na:", liga);
  setLigaButtons(liga);
  fillTeamSelects(liga);
}

// Načtení dat z Firestore (1x)
async function loadData() {
  // teams
  const teamsSnap = await getDocs(collection(db, "teams"));
  teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // players
  const playersSnap = await getDocs(collection(db, "players"));
  players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log("✅ Načteno týmů:", teams.length, "✅ Načteno hráčů:", players.length);
}

// Eventy
btnLiga1.addEventListener("click", (e) => { e.preventDefault(); switchLiga("1"); });
btnLiga2.addEventListener("click", (e) => { e.preventDefault(); switchLiga("2"); });

ligaSelect.addEventListener("change", () => switchLiga(ligaSelect.value));

teamHome.addEventListener("change", fillPlayerSelects);
teamAway.addEventListener("change", fillPlayerSelects);

// Init
window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadData();
    switchLiga("1"); // výchozí liga
  } catch (e) {
    console.error("❌ Chyba načítání dat pro Habaďůru:", e);
    alert("Nepodařilo se načíst data Habaďůry (týmy/hráči). Podívej se do konzole.");
  }
});
