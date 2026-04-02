
import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ habadura.js načten — část 1/5");

// HTML prvky
const ligaSelect = document.getElementById("liga-select");
const btnLiga1 = document.getElementById("btn-liga1");
const btnLiga2 = document.getElementById("btn-liga2");

const teamHome = document.getElementById("team-home");
const teamAway = document.getElementById("team-away");

const homePlayerSelects = document.querySelectorAll(".home-player");
const awayPlayerSelects = document.querySelectorAll(".away-player");

let teams = [];
let players = [];

// ===============================================
// 1) Načti TÝMY z Firestore (kolekce "teams")
// ===============================================
async function loadTeams() {
  const snap = await getDocs(collection(db, "teams"));
  teams = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
  console.log("✅ Týmy načteny:", teams);
}

// ===============================================
// 2) Načti HRÁČE z Firestore (kolekce "players")
// ===============================================
async function loadPlayers() {
  const snap = await getDocs(collection(db, "players"));
  players = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
  console.log("✅ Hráči načteni:", players);
}

// ===============================================
// 3) Naplnění SELECTŮ týmů podle ligy
// ===============================================
function fillTeams(liga) {
  const filtered = teams.filter(t => t.liga === Number(liga));

  teamHome.innerHTML = "";
  teamAway.innerHTML = "";

  filtered.forEach(t => {
    const opt1 = document.createElement("option");
    const opt2 = document.createElement("option");
    opt1.value = t.id;
    opt2.value = t.id;
    opt1.textContent = t.name;
    opt2.textContent = t.name;

    teamHome.appendChild(opt1);
    teamAway.appendChild(opt2);
  });
}

// ===============================================
