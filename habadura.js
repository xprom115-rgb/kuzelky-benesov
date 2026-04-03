
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
// ===============================================
//  HABAĎŮRA – ČÁST 2/5
//  Uložení zápasu do Firestore + výpočty
// ===============================================

import {
  addDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// HTML prvky pro souhrny a tlačítko
const sumBodyEl = document.getElementById("sum-body");
const sumKuzEl = document.getElementById("sum-kuz");
const dateInput = document.getElementById("match-date");
const submitMatchBtn = document.getElementById("submit-match");

// ------------------------------------------------
// Funkce: výpočet součtů z polí formuláře
// ------------------------------------------------
function computeSums() {
  // domácí
  const homeKuz = [...document.querySelectorAll(".home-kuz")]
    .map(i => Number(i.value) || 0);
  const homeBody = [...document.querySelectorAll(".home-body")]
    .map(i => Number(i.value) || 0);
  
  // hosté
  const awayKuz = [...document.querySelectorAll(".away-kuz")]
    .map(i => Number(i.value) || 0);
  const awayBody = [...document.querySelectorAll(".away-body")]
    .map(i => Number(i.value) || 0);

  // součty
  const sumHK = homeKuz.reduce((a,b)=>a+b,0);
  const sumHB = homeBody.reduce((a,b)=>a+b,0);
  const sumAK = awayKuz.reduce((a,b)=>a+b,0);
  const sumAB = awayBody.reduce((a,b)=>a+b,0);

  // aktualizace UI
  sumBodyEl.textContent = `${sumHB} : ${sumAB}`;
  sumKuzEl.textContent = `${sumHK} : ${sumAK}`;

  return {
    sumHK, sumHB, sumAK, sumAB
  };
}

// Počítat při jakékoli změně
["input","change"].forEach(ev=>{
  document.addEventListener(ev, computeSums);
});

// ------------------------------------------------
// Funkce: sejmutí hráčů (3 domácí / 3 hosté)
// ------------------------------------------------
function readPlayers(selectorName, selectorKuz, selectorBody) {
  const names = [...document.querySelectorAll(selectorName)];
  const kuzelky = [...document.querySelectorAll(selectorKuz)];
  const body = [...document.querySelectorAll(selectorBody)];

  return names.map((sel, i) => ({
    playerId: sel.value,
    kuzelky: Number(kuzelky[i].value) || 0,
    body: Number(body[i].value) || 0
  }));
}

// ------------------------------------------------
// Kontrola formuláře
// ------------------------------------------------
function validateForm(homePlayers, awayPlayers) {
  for (let p of [...homePlayers, ...awayPlayers]) {
    if (!p.playerId) return "Nevybral jsi hráče.";
    if (p.kuzelky < 0) return "Kuželky musí být kladné číslo.";
    if (![0,1,2].includes(p.body)) return "Body musí být 0, 1, nebo 2.";
  }

  return null;
}

// ------------------------------------------------
// Uložení zápasu
// ------------------------------------------------
async function saveMatch() {
  const liga = Number(ligaSelect.value);
  const homeTeam = teamHome.value;
  const awayTeam = teamAway.value;
  const date = dateInput.value;

  // hráči
  const homePlayers = readPlayers(".home-player", ".home-kuz", ".home-body");
  const awayPlayers = readPlayers(".away-player", ".away-kuz", ".away-body");

  const error = validateForm(homePlayers, awayPlayers);
  if (error) {
    alert(error);
    return;
  }

  const { sumHK, sumHB, sumAK, sumAB } = computeSums();

  if (!date) {
    alert("Vyber datum zápasu.");
    return;
  }

  const data = {
    liga,
    date,
    homeTeam,
    awayTeam,
    homePlayers,
    awayPlayers,
    sumHome: sumHK,
    sumAway: sumAK,
    bodyHome: sumHB,
    bodyAway: sumAB,
    createdAt: Timestamp.now()
  };

  try {
    await addDoc(collection(db, "matches"), data);
    alert("✅ Zápas byl úspěšně uložen!");

    // Vyčistit formulář
    document.querySelectorAll("input[type=number]").forEach(el => el.value = "");
    computeSums();

  } catch (e) {
    console.error(e);
    alert("❌ Nepodařilo se uložit zápas. Podívej se do konzole.");
  }
}

// Kliknutí na uložit
submitMatchBtn.addEventListener("click", saveMatch);

// Default datum = dnes
dateInput.valueAsDate = new Date();
// ===============================================
//  HABAĎŮRA – ČÁST 3/5
//  Výpočet tabulky DRUŽSTEV (průběžné pořadí)
// ===============================================

import {
  onSnapshot,
  collection,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const tabDruzstva = document.getElementById("tab-druzstva");

// ------------------------------------------------
// VÝPOČET TABULKY TÝMŮ PRO DANOU LIGU
// ------------------------------------------------
function computeTeamsTable(matches, liga) {
  // seznam týmů jen z této ligy
  const ligaTeams = teams.filter(t => t.liga === Number(liga));

  // výchozí struktura statistik
  const stats = {};
  ligaTeams.forEach(t => {
    stats[t.id] = {
      teamId: t.id,
      name: t.name,
      zapasy: 0,
      kuzelky: 0,
      body: 0,
      scoreBodyFor: 0,
      scoreBodyAgainst: 0,
      scoreKuzFor: 0,
      scoreKuzAgainst: 0,
      nv: 0 // nejlepší výkon hráče v týmu
    };
  });

  // projít všechny zápasy
  matches.forEach(m => {
    const home = stats[m.homeTeam];
    const away = stats[m.awayTeam];

    if (!home || !away) return; // pro jistotu

    // domácí
    home.zapasy++;
    home.kuzelky += m.sumHome;
    home.body += m.bodyHome;

    home.scoreBodyFor += m.bodyHome;
    home.scoreBodyAgainst += m.bodyAway;
    home.scoreKuzFor += m.sumHome;
    home.scoreKuzAgainst += m.sumAway;

    // NV domácí
    m.homePlayers.forEach(p => {
      if (p.kuzelky > home.nv) home.nv = p.kuzelky;
    });

    // hosté
    away.zapasy++;
    away.kuzelky += m.sumAway;
    away.body += m.bodyAway;

    away.scoreBodyFor += m.bodyAway;
    away.scoreBodyAgainst += m.bodyHome;
    away.scoreKuzFor += m.sumAway;
// ===============================================
//  HABAĎŮRA – ČÁST 4/5
//  Tabulka HRÁČŮ – průběžné pořadí
// ===============================================

const tabHracu = document.getElementById("tab-hracu");

// ------------------------------------------------
// Výpočet tabulky hráčů pro danou ligu
// ------------------------------------------------
function computePlayersTable(matches, liga) {
  const playerStats = {};

  // projdeme všechny zápasy v lize
  matches.forEach(m => {
    // domácí hráči
    m.homePlayers.forEach(p => {
      const key = p.playerId;
      if (!playerStats[key]) {
        const pl = players.find(x => x.id === key);
        if (!pl) return;
        playerStats[key] = {
          id: key,
          name: pl.name,
          teamId: pl.teamId,
          zapasy: 0,
          kuzelky: 0,
          body: 0,
          nv: 0
        };
      }

      const s = playerStats[key];
      s.zapasy++;
      s.kuzelky += p.kuzelky;
      s.body += p.body;
      if (p.kuzelky > s.nv) s.nv = p.kuzelky;
    });

    // hosté hráči
    m.awayPlayers.forEach(p => {
      const key = p.playerId;
      if (!playerStats[key]) {
        const pl = players.find(x => x.id === key);
        if (!pl) return;
        playerStats[key] = {
          id: key,
          name: pl.name,
          teamId: pl.teamId,
          zapasy: 0,
          kuzelky: 0,
          body: 0,
          nv: 0
        };
      }

      const s = playerStats[key];
      s.zapasy++;
      s.kuzelky += p.kuzelky;
      s.body += p.body;
      if (p.kuzelky > s.nv) s.nv = p.kuzelky;
    });
  });

  // spočítat průměry
  const rows = Object.values(playerStats).map(s => {
    s.prumer = s.zapasy > 0 ? (s.kuzelky / s.zapasy).toFixed(2) : "0.00";
    // přidáme název týmu
    const team = teams.find(t => t.id === s.teamId);
    s.teamName = team ? team.name : "";
    return s;
  });

  // řazení:
  return rows.sort((a, b) => {
    // 1. průměr
// ===============================================
//  HABAĎŮRA – ČÁST 4/5
//  Tabulka HRÁČŮ – průběžné pořadí
// ===============================================

const tabHracu = document.getElementById("tab-hracu");

// ------------------------------------------------
// Výpočet tabulky hráčů pro danou ligu
// ------------------------------------------------
function computePlayersTable(matches, liga) {
  const playerStats = {};

  // projdeme všechny zápasy v lize
  matches.forEach(m => {
    // domácí hráči
    m.homePlayers.forEach(p => {
      const key = p.playerId;
      if (!playerStats[key]) {
        const pl = players.find(x => x.id === key);
        if (!pl) return;
        playerStats[key] = {
          id: key,
          name: pl.name,
          teamId: pl.teamId,
          zapasy: 0,
          kuzelky: 0,
          body: 0,
          nv: 0
        };
      }

      const s = playerStats[key];
      s.zapasy++;
      s.kuzelky += p.kuzelky;
      s.body += p.body;
      if (p.kuzelky > s.nv) s.nv = p.kuzelky;
    });

    // hosté hráči
    m.awayPlayers.forEach(p => {
      const key = p.playerId;
      if (!playerStats[key]) {
        const pl = players.find(x => x.id === key);
        if (!pl) return;
        playerStats[key] = {
          id: key,
          name: pl.name,
          teamId: pl.teamId,
          zapasy: 0,
          kuzelky: 0,
          body: 0,
          nv: 0
        };
      }

      const s = playerStats[key];
      s.zapasy++;
      s.kuzelky += p.kuzelky;
      s.body += p.body;
      if (p.kuzelky > s.nv) s.nv = p.kuzelky;
    });
  });

  // spočítat průměry
  const rows = Object.values(playerStats).map(s => {
    s.prumer = s.zapasy > 0 ? (s.kuzelky / s.zapasy).toFixed(2) : "0.00";
    // přidáme název týmu
    const team = teams.find(t => t.id === s.teamId);
    s.teamName = team ? team.name : "";
    return s;
  });

  // řazení:
  return rows.sort((a, b) => {
    // 1. průměr
    if (b.prumer !== a.prumer) return b.prumer - a.prumer;
    // 2. NV
    if (b.nv !== a.nv) return b.nv - a.nv;
    // 3. celkové kuželky
    return b.kuzelky - a.kuzelky;
  });
}

// ------------------------------------------------
// vykreslení tabulky hráčů
// ------------------------------------------------
function renderPlayersTable(liga, matches) {
  const rows = computePlayersTable(matches, liga);

  let html = `
    <table class="tabulka">
      <tr>
        <th>Poř</th>
        <th>Hráč</th>
        <th>Družstvo</th>
        <th>Celkem</th>
        <th>Zápasy</th>
        <th>Průměr</th>
        <th>Body</th>
        <th>NV</th>
      </tr>
  `;

  rows.forEach((r, i) => {
    html += `
      <tr>
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${r.teamName}</td>
        <td>${r.kuzelky}</td>
        <td>${r.zapasy}</td>
        <td>${r.prumer}</td>
        <td>${r.body}</td>
        <td>${r.nv}</td>
      </tr>
    `;
  });

  html += `</table>`;

  tabHracu.innerHTML = html;
}

// ------------------------------------------------
// Propojení na realtime posluchač (z ČÁSTI 3)
// ------------------------------------------------
function listenPlayersForLiga(liga) {
  const q = query(collection(db, "matches"), where("liga", "==", Number(liga)));

  onSnapshot(q, snap => {
    const matches = snap.docs.map(d => d.data());
    console.log("🏅 Hráči – přepočet ligy", liga);
    renderPlayersTable(liga, matches);
  });
}

// propojit s tlačítky
btnLiga1.addEventListener("click", () => listenPlayersForLiga(1));
btnLiga2.addEventListener("click", () => listenPlayersForLiga(2));

listenPlayersForLiga(1);
    // ===============================================
//  HABAĎŮRA – ČÁST 5/5
//  Matice zápasů (kdo hrál s kým) pro ligu 1/2
// ===============================================

const tabMatice = document.getElementById("tab-matice");

// uložíme si poslední zápasy pro každou ligu, ať umíme překreslit při přepnutí
const matchesCache = { 1: [], 2: [] };

// ------------------------------------------------
// Pomocné – vytvoř mapu zápasů pro rychlé dohledání
// klíč "home-away" => zápas
// ------------------------------------------------
function buildMatchMap(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!m.homeTeam || !m.awayTeam) continue;
    map.set(`${m.homeTeam}-${m.awayTeam}`, m);
  }
  return map;
}

// ------------------------------------------------
// Vykreslení matice
// - řádek = tým A (rowTeam)
// - sloupec = tým B (colTeam)
// - v buňce: body + kuželky
// ------------------------------------------------
function renderMatrix(liga, matches) {
  const ligaTeams = teams.filter(t => t.liga === Number(liga));
  const map = buildMatchMap(matches);

  if (ligaTeams.length === 0) {
    tabMatice.innerHTML = "<p><em>Nejsou načtené týmy pro tuto ligu.</em></p>";
    return;
  }

  let html = `
    <div style="overflow:auto;">
      <table class="tabulka" style="min-width:900px; border-collapse:collapse; width:100%;">
        <tr>
          <th style="position:sticky; left:0; background:#1e235c; color:#ffd700; z-index:2;">Družstvo</th>
          ${ligaTeams.map(t => `<th style="background:#1e235c; color:#ffd700;">${t.name}</th>`).join("")}
        </tr>
  `;

  for (const rowTeam of ligaTeams) {
    html += `<tr>
      <th style="position:sticky; left:0; background:#1e235c; color:#ffd700; z-index:1;">${rowTeam.name}</th>`;

    for (const colTeam of ligaTeams) {
      // diagonála
      if (rowTeam.id === colTeam.id) {
        html += `
          <td style="text-align:center; background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.85); font-weight:bold;">
            —
          </td>`;
        continue;
      }

      // Zkus najít zápas row->col (row jako domácí)
      const directKey = `${rowTeam.id}-${colTeam.id}`;
      const reverseKey = `${colTeam.id}-${rowTeam.id}`;

      let m = map.get(directKey);
      let reversed = false;

      if (!m) {
        m = map.get(reverseKey);
        reversed = !!m;
      }

      if (!m) {
        // zatím neodehráno
        html += `<td style="text-align:center; color:rgba(255,255,255,0.5);"> </td>`;
        continue;
      }

      // pokud je zápas uložen opačně, otočíme zobrazení
      const bodyA = reversed ? m.bodyAway : m.bodyHome;
      const bodyB = reversed ? m.bodyHome : m.bodyAway;
      const kuzA  = reversed ? m.sumAway  : m.sumHome;
      const kuzB  = reversed ? m.sumHome  : m.sumAway;

      html += `
        <td style="text-align:center; padding:6px 4px; border:1px solid rgba(255,255,255,0.12);">
          <div style="font-weight:bold; color:#ffd700;">${bodyA} : ${bodyB}</div>
          <div style="font-size:12px; opacity:0.9;">${kuzA} : ${kuzB}</div>
        </td>
      `;
    }

    html += `</tr>`;
  }

  html += `</table></div>`;
  tabMatice.innerHTML = html;
}

// ------------------------------------------------
// Realtime posluchač zápasů pro ligu (matice)
// ------------------------------------------------
function listenMatrixForLiga(liga) {
  const q = query(collection(db, "matches"), where("liga", "==", Number(liga)));

  onSnapshot(q, snap => {
    const matches = snap.docs.map(d => d.data());
    matchesCache[liga] = matches;

    // vykreslit matici pouze pro právě vybranou ligu (podle ligaSelect)
    const currentLiga = Number(ligaSelect.value);
    if (currentLiga === Number(liga)) {
      renderMatrix(liga, matches);
    }
  });
}

// ------------------------------------------------
// Při přepnutí ligy překreslit z cache
// ------------------------------------------------
function refreshMatrixFromCache() {
  const liga = Number(ligaSelect.value);
  renderMatrix(liga, matchesCache[liga] || []);
}

// napojit na přepínače lig + select
btnLiga1.addEventListener("click", refreshMatrixFromCache);
btnLiga2.addEventListener("click", refreshMatrixFromCache);
ligaSelect.addEventListener("change", refreshMatrixFromCache);

// spustit posluchače pro obě ligy
listenMatrixForLiga(1);
listenMatrixForLiga(2);

// výchozí vykreslení (1. liga)
refreshMatrixFromCache();
