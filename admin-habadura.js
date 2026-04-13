// admin-habadura.js — FINÁLNÍ (kola 1/2/3 + archivace + editace zápasů)
// ================================================================
// - Přihlášení přes Firebase Auth (Email/Password)
// - Správa zápasů (edit/delete) + přepočet skóre 8 bodů
// - Sezóny: activeRound + publish flagy + volitelné 3. kolo
// - Uzavření kola = archivace do habadura_history/{seasonId}/rounds/{round}/matches/{matchId}
// - POZOR: v editaci zápasu jsou týmy zamknuté (kvůli deterministickému matchId v public habadura.js)

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
  doc,
  setDoc,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ admin-habadura.js načten");

const auth = getAuth(app);

// =====================
// DOM
// =====================
const loginBox  = document.getElementById("loginBox");
const appBox    = document.getElementById("appBox");
const editBox   = document.getElementById("editBox");

const emailEl   = document.getElementById("email");
const passEl    = document.getElementById("pass");
const btnLogin  = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginMsg  = document.getElementById("loginMsg");

const ligaEl       = document.getElementById("liga");
const filterDateEl = document.getElementById("filterDate");
const clearFilter  = document.getElementById("clearFilter");
const matchesList  = document.getElementById("matchesList");

// Seasons UI (kola)
const seasonSelect     = document.getElementById("seasonSelect");
const roundInfo        = document.getElementById("roundInfo");
const btnCloseRound    = document.getElementById("btnCloseRound");
const newSeasonId      = document.getElementById("newSeasonId");
const newSeasonLabel   = document.getElementById("newSeasonLabel");
const btnStartNewSeason= document.getElementById("btnStartNewSeason");
const seasonMsg        = document.getElementById("seasonMsg");

// Match editor
const editDate = document.getElementById("editDate");
const editHomeTeam = document.getElementById("editHomeTeam");
const editAwayTeam = document.getElementById("editAwayTeam");
const editHomePlayers = document.getElementById("editHomePlayers");
const editAwayPlayers = document.getElementById("editAwayPlayers");

const sumHomeEl  = document.getElementById("sumHome");
const sumAwayEl  = document.getElementById("sumAway");
const bodyHomeEl = document.getElementById("bodyHome"); // tady ukazujeme SKÓRE
const bodyAwayEl = document.getElementById("bodyAway"); // tady ukazujeme SKÓRE

const btnCloseEdit   = document.getElementById("btnCloseEdit");
const btnSaveEdit    = document.getElementById("btnSaveEdit");
const btnDeleteMatch = document.getElementById("btnDeleteMatch");
const editMsg        = document.getElementById("editMsg");

// =====================
// State
// =====================
let teams = [];      // teams cache
let players = [];    // players cache
let seasons = [];    // seasons cache

let unsubscribeMatches = null;

let currentDocId = null; // edited match docId

// =====================
// Helpers
// =====================
const csCompare = (a, b) => (a || "").localeCompare(b || "", "cs");
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function seasonMessage(text) {
  if (seasonMsg) seasonMsg.textContent = text || "";
}

function nowTs() {
  return Timestamp.now();
}

function teamName(id) {
  return teams.find(t => t.id === id)?.name || "(tým?)";
}

function playersOfTeam(teamId) {
  return players.filter(p => p.teamId === teamId).sort((a, b) => csCompare(a.name, b.name));
}

// Bonus do SKÓRE za kuželky: +2 vítězi, remíza 1:1
function computeBonus(sumHome, sumAway) {
  if (sumHome > sumAway) return { bonusScoreHome: 2, bonusScoreAway: 0 };
  if (sumHome < sumAway) return { bonusScoreHome: 0, bonusScoreAway: 2 };
  return { bonusScoreHome: 1, bonusScoreAway: 1 };
}

// =====================
// Load base data
// =====================
async function loadBase() {
  const ts = await getDocs(collection(db, "teams"));
  teams = ts.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => csCompare(a.name, b.name));

  const ps = await getDocs(collection(db, "players"));
  players = ps.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => csCompare(a.name, b.name));
}

// =====================
// Seasons UI
// =====================
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

  syncRoundInfo();
}

function syncRoundInfo() {
  if (!roundInfo || !seasonSelect) return;
  const s = seasons.find(x => x.id === seasonSelect.value);
  if (!s) return;
  const r = Number(s.activeRound || 1);
  roundInfo.value = `kolo ${r}`;
}

seasonSelect?.addEventListener("change", syncRoundInfo);

// Uzavření aktuálního kola + archivace
btnCloseRound?.addEventListener("click", async () => {
  const id = seasonSelect?.value;
  const s = seasons.find(x => x.id === id);
  if (!s) return seasonMessage("⚠️ Nevybraná sezóna.");

  const currentRound = Number(s.activeRound || 1);

  // --- Kolo 1 ---
  if (currentRound === 1) {
    if (!confirm(`Uzavřít 1. kolo sezóny ${s.label || id}?\n(Zápasy se zkopírují do archivu a přepne se na 2. kolo)`)) return;
    try {
      seasonMessage("⏳ Archivuju zápasy 1. kola…");
      const copied = await archiveRoundMatches(id, 1);

      await updateDoc(doc(db, "seasons", id), {
        round1Published: true,
        activeRound: 2,
        updatedAt: nowTs()
      });

      seasonMessage(`✅ 1. kolo uzavřeno. Archiv: ${copied} zápasů. Aktivní je 2. kolo.`);
    } catch (e) {
      console.error(e);
      seasonMessage("❌ Nepodařilo se uzavřít 1. kolo (archivace/rules/auth).");
    }
    return;
  }

  // --- Kolo 2 + otázka na 3. kolo ---
  if (currentRound === 2) {
    if (!confirm(`Uzavřít 2. kolo sezóny ${s.label || id}?\n(Zápasy se zkopírují do archivu)`)) return;

    const wantRound3 = confirm(
      "Chcete odehrát 3. kolo?\n\n" +
      "OK = ano (přepne se na kolo 3)\n" +
      "Storno = ne (sezóna skončí po 2 kolech a zveřejní se finální)"
    );

    try {
      seasonMessage("⏳ Archivuju zápasy 2. kola…");
      const copied = await archiveRoundMatches(id, 2);

      if (wantRound3) {
        await updateDoc(doc(db, "seasons", id), {
          round2Published: true,
          hasRound3: true,
          activeRound: 3,
          updatedAt: nowTs()
        });
        seasonMessage(`✅ 2. kolo uzavřeno. Archiv: ${copied} zápasů. Bude 3. kolo (aktivní kolo 3).`);
      } else {
        await updateDoc(doc(db, "seasons", id), {
          round2Published: true,
          hasRound3: false,
          finalPublished: true,
          isActive: false,
          updatedAt: nowTs()
        });
        seasonMessage(`✅ 2. kolo uzavřeno. Archiv: ${copied} zápasů. 3. kolo nebude. Sezóna ukončena a finální zveřejněno (součet 2 kol).`);
      }
    } catch (e) {
      console.error(e);
      seasonMessage("❌ Nepodařilo se uzavřít 2. kolo (archivace/rules/auth).");
    }
    return;
  }

  // --- Kolo 3 ---
  if (currentRound === 3) {
    if (!confirm(`Uzavřít 3. kolo sezóny ${s.label || id}?\n(Zápasy se zkopírují do archivu, sezóna se ukončí a zveřejní se finální)`)) return;

    try {
      seasonMessage("⏳ Archivuju zápasy 3. kola…");
      const copied = await archiveRoundMatches(id, 3);

      await updateDoc(doc(db, "seasons", id), {
        round3Published: true,
        finalPublished: true,
        isActive: false,
        updatedAt: nowTs()
      });

      seasonMessage(`✅ 3. kolo uzavřeno. Archiv: ${copied} zápasů. Sezóna ukončena a finální zveřejněno (součet 3 kol).`);
    } catch (e) {
      console.error(e);
      seasonMessage("❌ Nepodařilo se uzavřít 3. kolo (archivace/rules/auth).");
    }
    return;
  }

  seasonMessage("⚠️ Neznámé aktivní kolo (čekám 1/2/3).");
});

// Start nové sezóny (aktivní kolo 1)
btnStartNewSeason?.addEventListener("click", async () => {
  const id = (newSeasonId?.value || "").trim();       // např. 2026-2027
  const label = (newSeasonLabel?.value || "").trim(); // např. 2026/2027
  if (!id) return seasonMessage("⚠️ Zadej ID nové sezóny (např. 2026-2027).");

  if (!confirm(`Opravdu založit novou sezónu ${label || id}?\n(Aktivní bude kolo 1)`)) return;

  try {
    // ukonči případnou aktivní sezónu, aby nebyly dvě aktivní
    const active = seasons.find(s => s.isActive);
    if (active) {
      await updateDoc(doc(db, "seasons", active.id), { isActive: false, updatedAt: nowTs() });
    }

    await setDoc(doc(db, "seasons", id), {
      label: label || id,
      isActive: true,
      activeRound: 1,
      round1Published: false,
      round2Published: false,
      round3Published: false,
      hasRound3: null,
      finalPublished: false,
      createdAt: nowTs(),
      updatedAt: nowTs()
    });

    newSeasonId.value = "";
    newSeasonLabel.value = "";
    seasonMessage("✅ Nová sezóna založena. Aktivní je kolo 1.");
  } catch (e) {
    console.error(e);
    seasonMessage("❌ Nepodařilo se založit novou sezónu (rules/auth).");
  }
});

// =====================
// Archivace kola do habadura_history
// =====================
async function archiveRoundMatches(seasonId, round) {
  // načti všechny zápasy sezóny (bez indexů) a filtruj kolo v JS
  const qSeason = query(collection(db, "matches"), where("seasonId", "==", seasonId));
  const snap = await getDocs(qSeason);

  const srcDocs = snap.docs.filter(d => Number(d.data()?.round) === Number(round));
  if (srcDocs.length === 0) return 0;

  const BATCH_LIMIT = 450;
  let copied = 0;

  for (let i = 0; i < srcDocs.length; i += BATCH_LIMIT) {
    const chunk = srcDocs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const d of chunk) {
      const m = d.data() || {};

      // habadura_history/{seasonId}/rounds/{round}/matches/{matchId}
      const destRef = doc(
        db,
        "habadura_history", seasonId,
        "rounds", String(round),
        "matches", d.id
      );

      batch.set(destRef, {
        ...m,
        seasonId: m.seasonId || seasonId,
        round: Number(m.round ?? round),
        archivedAt: Timestamp.now(),
        sourceMatchId: d.id
      }, { merge: false });
    }

    await batch.commit();
    copied += chunk.length;
  }

  return copied;
}

// =====================
// Matches list (admin)
// =====================
function listenMatches() {
  if (unsubscribeMatches) unsubscribeMatches();

  const liga = Number(ligaEl.value);
  const q = query(collection(db, "matches"), where("liga", "==", liga));

  unsubscribeMatches = onSnapshot(q, (snap) => {
    let list = snap.docs.map(d => ({ docId: d.id, data: d.data() }));

    const fd = filterDateEl.value;
    if (fd) list = list.filter(x => x.data.date === fd);

    // řazení dle date desc
    list.sort((a, b) => (b.data.date || "").localeCompare(a.data.date || ""));

    renderMatches(list);
  }, (err) => console.error(err));
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
    const r = m.round ? ` • kolo ${m.round}` : "";

    return `
      <div class="listrow">
        <div>
          <strong>${m.date || ""}</strong> — ${home} vs ${away}${r}
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

// =====================
// Match editor
// =====================
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

function recompute() {
  const hk = [...document.querySelectorAll(".home-kuz")].map(x => Number(x.value) || 0);
  const hb = [...document.querySelectorAll(".home-bod")].map(x => Number(x.value) || 0);
  const ak = [...document.querySelectorAll(".away-kuz")].map(x => Number(x.value) || 0);
  const ab = [...document.querySelectorAll(".away-bod")].map(x => Number(x.value) || 0);

  const sumHome = sum(hk);
  const sumAway = sum(ak);

  const scoreHomeBase = sum(hb);  // musí dát celkem 6
  const scoreAwayBase = sum(ab);

  const { bonusScoreHome, bonusScoreAway } = computeBonus(sumHome, sumAway);

  const scoreHome = scoreHomeBase + bonusScoreHome; // musí dát celkem 8
  const scoreAway = scoreAwayBase + bonusScoreAway;

  // body 2/1/0 dle výsledného skóre
  let leaguePointsHome = 0, leaguePointsAway = 0;
  if (scoreHome > scoreAway) { leaguePointsHome = 2; leaguePointsAway = 0; }
  else if (scoreHome < scoreAway) { leaguePointsHome = 0; leaguePointsAway = 2; }
  else { leaguePointsHome = 1; leaguePointsAway = 1; }

  // UI (součet kuželek + skóre)
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

  // Zamknout týmy (kvůli deterministickému matchId)
  editHomeTeam.disabled = true;
  editAwayTeam.disabled = true;

  editHomePlayers.innerHTML = "";
  editAwayPlayers.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    editHomePlayers.appendChild(mkPlayerRow("home", i));
    editAwayPlayers.appendChild(mkPlayerRow("away", i));
  }

  fillPlayerRows();

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

  [...document.querySelectorAll(".home-kuz,.home-bod,.away-kuz,.away-bod")]
    .forEach(inp => inp.addEventListener("input", recompute));
}

btnCloseEdit?.addEventListener("click", () => {
  editBox.style.display = "none";
  currentDocId = null;
});

btnSaveEdit?.addEventListener("click", async () => {
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

btnDeleteMatch?.addEventListener("click", async () => {
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

// =====================
// Filters
// =====================
ligaEl?.addEventListener("change", () => {
  editBox.style.display = "none";
  currentDocId = null;
  listenMatches();
});

clearFilter?.addEventListener("click", () => {
  filterDateEl.value = "";
  listenMatches();
});
filterDateEl?.addEventListener("change", listenMatches);

// =====================
// Auth
// =====================
btnLogin?.addEventListener("click", async () => {
  loginMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  } catch (e) {
    console.error(e);
    loginMsg.textContent = "Nepodařilo se přihlásit (zkontroluj email/heslo).";
  }
});

btnLogout?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("✅ admin přihlášen UID:", user.uid);

    loginBox.style.display = "none";
    appBox.style.display = "block";

    await loadBase();

    // realtime seasons
    onSnapshot(collection(db, "seasons"), (snap) => {
      seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderSeasons();
    });

    listenMatches();
  } else {
    loginBox.style.display = "block";
    appBox.style.display = "none";
    editBox.style.display = "none";
    currentDocId = null;

    if (unsubscribeMatches) unsubscribeMatches();
    unsubscribeMatches = null;
  }
});
