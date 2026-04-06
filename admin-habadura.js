// admin-habadura.js — FINÁLNÍ (editace zápasu dle nové logiky)
// - Skóre = (součet bodů hráčů) + (bonus za kuželky: 2:0 / 0:2 / 1:1)
// - Součet bodů hráčů musí být 6, celkové Skóre 8
// - Body do tabulky (2/1/0) podle výsledného Skóre
// - Ukládá přesně pole, která používá veřejná habadura.js

import { app, db } from "./firebase-config.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ admin-habadura.js načten");

const auth = getAuth(app);

// DOM
const loginBox = document.getElementById("loginBox");
const appBox = document.getElementById("appBox");
const editBox = document.getElementById("editBox");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginMsg = document.getElementById("loginMsg");

const ligaEl = document.getElementById("liga");
const filterDateEl = document.getElementById("filterDate");
const clearFilter = document.getElementById("clearFilter");
const matchesList = document.getElementById("matchesList");

const editDate = document.getElementById("editDate");
const editHomeTeam = document.getElementById("editHomeTeam");
const editAwayTeam = document.getElementById("editAwayTeam");
const editHomePlayers = document.getElementById("editHomePlayers");
const editAwayPlayers = document.getElementById("editAwayPlayers");

const sumHomeEl = document.getElementById("sumHome");
const sumAwayEl = document.getElementById("sumAway");
const bodyHomeEl = document.getElementById("bodyHome"); // zde zobrazujeme Skóre
const bodyAwayEl = document.getElementById("bodyAway"); // zde zobrazujeme Skóre

const btnCloseEdit = document.getElementById("btnCloseEdit");
const btnSaveEdit = document.getElementById("btnSaveEdit");
const btnDeleteMatch = document.getElementById("btnDeleteMatch");
const editMsg = document.getElementById("editMsg");

// ===== SEZÓNA UI (KROK 4.2) =====
const seasonSelect = document.getElementById("seasonSelect");
const phaseSelect = document.getElementById("phaseSelect");
const btnPublishAutumn = document.getElementById("btnPublishAutumn");
const btnPublishSpring = document.getElementById("btnPublishSpring");
const newSeasonId = document.getElementById("newSeasonId");
const newSeasonLabel = document.getElementById("newSeasonLabel");
const btnStartNewSeason = document.getElementById("btnStartNewSeason");
const seasonMsg = document.getElementById("seasonMsg");


let teams = [];
let players = [];
let currentDocId = null;
let unsubscribe = null;
// ===== SEZÓNY (KROK 4.2) =====
let seasons = []; // [{id,label,isActive,activePhase,autumnPublished,springPublished,...}]

function seasonMessage(text) {
  if (seasonMsg) seasonMsg.textContent = text || "";
}

function renderSeasons() {
  if (!seasonSelect) return;

  const sorted = seasons.slice().sort((a, b) => (b.id || "").localeCompare(a.id || ""));

  seasonSelect.innerHTML = sorted.map(s => {
    const tag = s.isActive ? " (aktivní)" : "";
    const label = s.label || s.id;
    return `<option value="${s.id}">${label}${tag}</option>`;
  }).join("");

  const active = sorted.find(s => s.isActive);
  if (active) seasonSelect.value = active.id;

  syncPhaseSelect();
}

function syncPhaseSelect() {
  if (!phaseSelect || !seasonSelect) return;

  const selectedId = seasonSelect.value;
  const s = seasons.find(x => x.id === selectedId);

  if (!s) return;

  phaseSelect.value = s.activePhase || "autumn";
}

seasonSelect?.addEventListener("change", syncPhaseSelect);


const csCompare = (a, b) => (a || "").localeCompare(b || "", "cs");
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function teamName(id) {
  return teams.find(t => t.id === id)?.name || "(tým?)";
}

// bonus do SKÓRE za kuželky
function computeBonus(sumHome, sumAway) {
  if (sumHome > sumAway) return { bonusScoreHome: 2, bonusScoreAway: 0 };
  if (sumHome < sumAway) return { bonusScoreHome: 0, bonusScoreAway: 2 };
  return { bonusScoreHome: 1, bonusScoreAway: 1 }; // remíza kuželek
}

// načti týmy a hráče pro editor
async function loadBase() {
  const ts = await getDocs(collection(db, "teams"));
  teams = ts.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => csCompare(a.name, b.name));

  const ps = await getDocs(collection(db, "players"));
  players = ps.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => csCompare(a.name, b.name));
}

function fillTeamSelects(liga) {
  const ligaTeams = teams.filter(t => Number(t.liga) === Number(liga));
  editHomeTeam.innerHTML = "";
  editAwayTeam.innerHTML = "";
  ligaTeams.forEach(t => {
    const o1 = document.createElement("option");
    o1.value = t.id; o1.textContent = t.name;
    const o2 = document.createElement("option");
    o2.value = t.id; o2.textContent = t.name;
    editHomeTeam.appendChild(o1);
    editAwayTeam.appendChild(o2);
  });
}

function playersOfTeam(teamId) {
  return players.filter(p => p.teamId === teamId)
    .sort((a, b) => csCompare(a.name, b.name));
}

function mkPlayerRow(side, idx) {
  const row = document.createElement("div");
  row.className = "toolrow";
  row.innerHTML = `
    <label class="small">Hráč ${idx + 1}:</label>
    <select class="${side}-pl"></select>
    <input type="number" class="${side}-kuz" placeholder="Kuželky" style="max-width:120px;">
    <input type="number" class="${side}-bod" placeholder="Body (0/1/2)" style="max-width:120px;">
  `;
  return row;
}

function fillPlayerRows() {
  const hp = playersOfTeam(editHomeTeam.value);
  const ap = playersOfTeam(editAwayTeam.value);

  document.querySelectorAll(".home-pl").forEach(sel => {
    sel.innerHTML = "";
    hp.forEach(p => {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
  });

  document.querySelectorAll(".away-pl").forEach(sel => {
    sel.innerHTML = "";
    ap.forEach(p => {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
  });
}

// přepočet: kuželky + skóre 8 + body 2/1/0
function recompute() {
  const hk = [...document.querySelectorAll(".home-kuz")].map(x => Number(x.value) || 0);
  const hb = [...document.querySelectorAll(".home-bod")].map(x => Number(x.value) || 0);
  const ak = [...document.querySelectorAll(".away-kuz")].map(x => Number(x.value) || 0);
  const ab = [...document.querySelectorAll(".away-bod")].map(x => Number(x.value) || 0);

  const sumHome = sum(hk);
  const sumAway = sum(ak);

  const scoreHomeBase = sum(hb); // musí dát dohromady 6
  const scoreAwayBase = sum(ab);

  const { bonusScoreHome, bonusScoreAway } = computeBonus(sumHome, sumAway);

  const scoreHome = scoreHomeBase + bonusScoreHome; // musí dát dohromady 8
  const scoreAway = scoreAwayBase + bonusScoreAway;

  // body 2/1/0 do tabulky podle výsledného SkÓRE
  let leaguePointsHome = 0, leaguePointsAway = 0;
  if (scoreHome > scoreAway) { leaguePointsHome = 2; leaguePointsAway = 0; }
  else if (scoreHome < scoreAway) { leaguePointsHome = 0; leaguePointsAway = 2; }
  else { leaguePointsHome = 1; leaguePointsAway = 1; }

  // UI (tady ukazujeme kuželky a Skóre)
  sumHomeEl.textContent = sumHome;
  sumAwayEl.textContent = sumAway;
  bodyHomeEl.textContent = scoreHome;
  bodyAwayEl.textContent = scoreAway;

  return {
    sumHome, sumAway,
    scoreHomeBase, scoreAwayBase,
    bonusScoreHome, bonusScoreAway,
    scoreHome, scoreAway,
    leaguePointsHome, leaguePointsAway
  };
}

function openEdit(docId, match, liga) {
  currentDocId = docId;
  editMsg.textContent = "";
  editBox.style.display = "block";

  fillTeamSelects(liga);

  editDate.value = match.date || "";
  editHomeTeam.value = match.homeTeam;
  editAwayTeam.value = match.awayTeam;

  // Doporučení: neměnit týmy (kvůli deterministickému matchId)
  editHomeTeam.disabled = true;
  editAwayTeam.disabled = true;

  // vytvoř 3+3 řádky
  editHomePlayers.innerHTML = "";
  editAwayPlayers.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    editHomePlayers.appendChild(mkPlayerRow("home", i));
    editAwayPlayers.appendChild(mkPlayerRow("away", i));
  }

  fillPlayerRows();

  // doplň hodnoty
  (match.homePlayers || []).forEach((p, i) => {
    const sel = document.querySelectorAll(".home-pl")[i];
    const kuz = document.querySelectorAll(".home-kuz")[i];
    const bod = document.querySelectorAll(".home-bod")[i];
    if (sel) sel.value = p.playerId;
    if (kuz) kuz.value = p.kuzelky ?? "";
    if (bod) bod.value = p.body ?? "";
  });

  (match.awayPlayers || []).forEach((p, i) => {
    const sel = document.querySelectorAll(".away-pl")[i];
    const kuz = document.querySelectorAll(".away-kuz")[i];
    const bod = document.querySelectorAll(".away-bod")[i];
    if (sel) sel.value = p.playerId;
    if (kuz) kuz.value = p.kuzelky ?? "";
    if (bod) bod.value = p.body ?? "";
  });

  recompute();

  // listeners pro přepočet
  [...document.querySelectorAll(".home-kuz,.home-bod,.away-kuz,.away-bod")]
    .forEach(inp => inp.addEventListener("input", recompute));
}

function renderMatches(list) {
  if (!list.length) {
    matchesList.innerHTML = "<p><em>Žádné zápasy.</em></p>";
    return;
  }

  matchesList.innerHTML = list.map(x => {
    const m = x.data;
    const home = teamName(m.homeTeam);
    const away = teamName(m.awayTeam);

    const score = `${m.scoreHome ?? "?"}:${m.scoreAway ?? "?"}`;
    const pts = `${m.leaguePointsHome ?? "?"}:${m.leaguePointsAway ?? "?"}`;
    const kuz = `${m.sumHome ?? "?"}:${m.sumAway ?? "?"}`;

    return `
      <div class="listrow">
        <div>
          <strong>${m.date || ""}</strong> — ${home} vs ${away}
          <span class="small"> | Skóre ${score} | Body ${pts} | Kuželky ${kuz}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-primary" data-edit="${x.docId}">Upravit</button>
        </div>
      </div>
    `;
  }).join("");

  matchesList.querySelectorAll("button[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.edit;
      const found = list.find(x => x.docId === id);
      if (found) openEdit(id, found.data, Number(ligaEl.value));
    });
  });
}

function listenMatches() {
  if (unsubscribe) unsubscribe();

  const liga = Number(ligaEl.value);
  const q = query(collection(db, "matches"), where("liga", "==", liga));

  unsubscribe = onSnapshot(q, snap => {
    let list = snap.docs.map(d => ({ docId: d.id, data: d.data() }));

    const fd = filterDateEl.value;
    if (fd) list = list.filter(x => x.data.date === fd);

    list.sort((a, b) => (b.data.date || "").localeCompare(a.data.date || ""));
    renderMatches(list);
  });
}

// ---------- Auth ----------
btnLogin.addEventListener("click", async () => {
  loginMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  } catch (e) {
    console.error(e);
    loginMsg.textContent = "Nepodařilo se přihlásit (zkontroluj email/heslo).";
  }
});

btnLogout.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("✅ admin přihlášen UID:", user.uid);
    loginBox.style.display = "none";
    appBox.style.display = "block";
    await loadBase();
 // ✅ KROK 4.3 – realtime načítání sezón do adminu
onSnapshot(
  collection(db, "seasons"),
  (snap) => {
    seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log("✅ seasons loaded:", seasons.length);
    renderSeasons();
    syncPhaseSelect();
  },
  (err) => {
    console.error("❌ seasons snapshot error:", err);
  }
);

    listenMatches();
  } else {
    loginBox.style.display = "block";
    appBox.style.display = "none";
    editBox.style.display = "none";
    currentDocId = null;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  }
});

// UI events
ligaEl.addEventListener("change", () => {
  editBox.style.display = "none";
  currentDocId = null;
  listenMatches();
});

clearFilter.addEventListener("click", () => {
  filterDateEl.value = "";
  listenMatches();
});
filterDateEl.addEventListener("change", listenMatches);

btnCloseEdit.addEventListener("click", () => {
  editBox.style.display = "none";
  currentDocId = null;
});

// SAVE EDIT
btnSaveEdit.addEventListener("click", async () => {
  if (!currentDocId) return;

  const liga = Number(ligaEl.value);

  const homePlayers = [...document.querySelectorAll(".home-pl")].map((sel, i) => ({
    playerId: sel.value,
    kuzelky: Number(document.querySelectorAll(".home-kuz")[i].value) || 0,
    body: Number(document.querySelectorAll(".home-bod")[i].value) || 0
  }));

  const awayPlayers = [...document.querySelectorAll(".away-pl")].map((sel, i) => ({
    playerId: sel.value,
    kuzelky: Number(document.querySelectorAll(".away-kuz")[i].value) || 0,
    body: Number(document.querySelectorAll(".away-bod")[i].value) || 0
  }));

  // validace vstupů
  for (const p of [...homePlayers, ...awayPlayers]) {
    if (!p.playerId) { editMsg.textContent = "Vyber hráče ve všech řádcích."; return; }
    if (![0, 1, 2].includes(p.body)) { editMsg.textContent = "Body musí být 0/1/2."; return; }
    if (p.kuzelky < 0) { editMsg.textContent = "Kuželky musí být kladné."; return; }
  }

  const calc = recompute();

  // validace 6 + 2 = 8
  const baseTotal = calc.scoreHomeBase + calc.scoreAwayBase;
  const totalScore = calc.scoreHome + calc.scoreAway;
  if (baseTotal !== 6) { editMsg.textContent = `⚠️ Součet bodů hráčů musí být 6 (je ${baseTotal}).`; return; }
  if (totalScore !== 8) { editMsg.textContent = `⚠️ Celkové Skóre musí být 8 (je ${totalScore}).`; return; }

  try {
    await updateDoc(doc(db, "matches", currentDocId), {
      liga,
      date: editDate.value,

      // týmy jsou zamknuté (neměníme)
      homeTeam: editHomeTeam.value,
      awayTeam: editAwayTeam.value,

      homePlayers,
      awayPlayers,

      sumHome: calc.sumHome,
      sumAway: calc.sumAway,

      scoreHomeBase: calc.scoreHomeBase,
      scoreAwayBase: calc.scoreAwayBase,
      bonusScoreHome: calc.bonusScoreHome,
      bonusScoreAway: calc.bonusScoreAway,
      scoreHome: calc.scoreHome,
      scoreAway: calc.scoreAway,

      leaguePointsHome: calc.leaguePointsHome,
      leaguePointsAway: calc.leaguePointsAway
    });

    editMsg.textContent = "✅ Uloženo.";
  } catch (e) {
    console.error(e);
    editMsg.textContent = "❌ Uložení selhalo (zkontroluj Rules/UID admina).";
  }
});

// DELETE
btnDeleteMatch.addEventListener("click", async () => {
  if (!currentDocId) return;
  if (!confirm("Opravdu smazat zápas?")) return;

  try {
    await deleteDoc(doc(db, "matches", currentDocId));
    editBox.style.display = "none";
    currentDocId = null;
  } catch (e) {
    console.error(e);
    editMsg.textContent = "❌ Smazání selhalo (zkontroluj Rules/UID admina).";
  }
});
``
