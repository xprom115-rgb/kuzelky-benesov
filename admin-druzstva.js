import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

/* =========================================================
   LOGIN (Auth)
   ========================================================= */

const loginBox = document.getElementById("loginBox");
const appBox = document.getElementById("appBox");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginMsg = document.getElementById("loginMsg");

function setLoginMsg(txt) {
  if (loginMsg) loginMsg.textContent = txt || "";
}

function showApp(isLoggedIn) {
  if (loginBox) loginBox.style.display = isLoggedIn ? "none" : "";
  if (appBox) appBox.style.display = isLoggedIn ? "" : "none";
}

// ✅ hned při načtení schovej admin část (ať se nezobrazí "flash")
showApp(false);

btnLogin?.addEventListener("click", async () => {
  const email = (emailEl?.value || "").trim();
  const pass = passEl?.value || "";

  if (!email || !pass) {
    setLoginMsg("⚠️ Zadej email i heslo.");
    return;
  }

  try {
    setLoginMsg("⏳ Přihlašuji…");
    await signInWithEmailAndPassword(auth, email, pass);
    setLoginMsg("✅ Přihlášeno.");
  } catch (e) {
    console.error(e);
    setLoginMsg("❌ Přihlášení se nepovedlo (zkontroluj email/heslo).");
  }
});

btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error(e);
  }
});

onAuthStateChanged(auth, (user) => {
  showApp(!!user);
  if (!user) setLoginMsg("");
});

/* =========================================================
   DOROST: zpravodaje (URL) + historie (jen 8. kolo) + návod
   Firestore:
     team_manual/DOROST { bulletins: { "1":{title,url}, ... } }
     team_history/DOROST/seasons/{seasonId} { summaryBulletin{round:8,title,url} }
   ========================================================= */

const dorostRound = document.getElementById("dorostRound");
const dorostPdfUrl = document.getElementById("dorostPdfUrl");
const btnSaveDorostPdf = document.getElementById("btnSaveDorostPdf");
const btnLoadDorostPdfs = document.getElementById("btnLoadDorostPdfs");
const btnClearDorostPdfs = document.getElementById("btnClearDorostPdfs");

const dorostSeason = document.getElementById("dorostSeason");
const btnDorostToHistory = document.getElementById("btnDorostToHistory");

const btnDorostGuide = document.getElementById("btnDorostGuide");
const dorostGuideBox = document.getElementById("dorostGuideBox");

const dorostMsg = document.getElementById("dorostMsg");
const dorostList = document.getElementById("dorostList");

function setDorostMsg(txt) {
  if (dorostMsg) dorostMsg.textContent = txt || "";
}

function renderDorostList(bulletinsMap) {
  if (!dorostList) return;

  if (!bulletinsMap || typeof bulletinsMap !== "object" || Object.keys(bulletinsMap).length === 0) {
    dorostList.innerHTML = "<em>Zatím nejsou uložené žádné zpravodaje.</em>";
    return;
  }

  const rounds = Object.keys(bulletinsMap)
    .filter(k => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));

  dorostList.innerHTML = rounds.map(r => {
    const it = bulletinsMap[r] || {};
    const title = it.title || `${r}. kolo`;
    const url = it.url || "";
    if (!url) return `<div>${r}. kolo: <em>(bez URL)</em></div>`;
    return `<div>${r}. kolo: <a class="btn-open" href="${url}" target="_blank" rel="noopener">Otevřít PDF</a> <span class="small">${title}</span></div>`;
  }).join("");
}

async function loadDorostBulletins() {
  setDorostMsg("⏳ Načítám zpravodaje…");

  try {
    const ref = doc(db, "team_manual", "DOROST");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // auto-vytvoř prázdný dokument
      await setDoc(ref, {
        updatedAt: new Date().toISOString(),
        bulletins: {}
      }, { merge: true });

      renderDorostList({});
      setDorostMsg("✅ Dokument vytvořen. Zatím nejsou uložené žádné zpravodaje.");
      return;
    }

    const data = snap.data();
    const bulletins = (data.bulletins && typeof data.bulletins === "object") ? data.bulletins : {};
    renderDorostList(bulletins);
    setDorostMsg("✅ Načteno.");
  } catch (e) {
    console.error(e);
    setDorostMsg("❌ Načtení selhalo (zkontroluj Rules / přihlášení).");
  }
}

btnLoadDorostPdfs?.addEventListener("click", loadDorostBulletins);

btnSaveDorostPdf?.addEventListener("click", async () => {
  try {
    const round = dorostRound?.value || "1";
    let url = (dorostPdfUrl?.value || "").trim();

    // auto-očištění: chrome-extension://.../https://...pdf → vezmeme jen https část
    const m = url.match(/https?:\/\/.+/i);
    if (m) url = m[0].trim();

    const rNum = Number(round);
    if (!rNum || rNum < 1 || rNum > 8) {
      setDorostMsg("⚠️ Kolo musí být 1–8.");
      return;
    }
    if (!url) {
      setDorostMsg("⚠️ Vlož odkaz na PDF.");
      return;
    }
    if (!/^https?:\/\/.+/i.test(url) || !/\.pdf(\?|$)/i.test(url)) {
      setDorostMsg("⚠️ Odkaz musí být platná URL a ideálně končit na .pdf");
      return;
    }

    setDorostMsg("⏳ Ukládám odkaz do Firestore…");

    const ref = doc(db, "team_manual", "DOROST");
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const bulletins = (data.bulletins && typeof data.bulletins === "object") ? data.bulletins : {};

    bulletins[String(rNum)] = {
      title: `${rNum}. kolo`,
      url
    };

    await setDoc(ref, {
      updatedAt: new Date().toISOString(),
      bulletins
    }, { merge: true });

    await loadDorostBulletins();

    if (dorostPdfUrl) dorostPdfUrl.value = "";
    setDorostMsg(`✅ Uloženo: ${rNum}. kolo`);
  } catch (e) {
    console.error(e);
    setDorostMsg("❌ Uložení selhalo (zkontroluj Rules / přihlášení).");
  }
});

btnClearDorostPdfs?.addEventListener("click", async () => {
  if (!confirm("Opravdu vymazat všechny uložené zpravodaje dorostu? (test)")) return;

  try {
    setDorostMsg("⏳ Mažu…");
    const ref = doc(db, "team_manual", "DOROST");
    await setDoc(ref, {
      updatedAt: new Date().toISOString(),
      bulletins: {}
    }, { merge: true });

    renderDorostList({});
    setDorostMsg("✅ Vymazáno.");
  } catch (e) {
    console.error(e);
    setDorostMsg("❌ Mazání selhalo (zkontroluj Rules / přihlášení).");
  }
});

// Přenos do historie: uloží jen 8. kolo (souhrn) do team_history/DOROST/seasons/{season}
btnDorostToHistory?.addEventListener("click", async () => {
  // okamžitá hláška, ať je vidět že se klik zachytil
  setDorostMsg("🟡 Klik zachycen – přenáším do historie…");

  try {
    const seasonId = (dorostSeason?.value || "").trim();
    if (!seasonId) {
      setDorostMsg("⚠️ Vyplň sezónu (např. 2025-2026).");
      return;
    }

    const srcRef = doc(db, "team_manual", "DOROST");
    const srcSnap = await getDoc(srcRef);

    if (!srcSnap.exists()) {
      setDorostMsg("⚠️ Neexistuje team_manual/DOROST – nejdřív ulož zpravodaj 8. kola.");
      return;
    }

    const src = srcSnap.data();
    const bulletins = (src.bulletins && typeof src.bulletins === "object") ? src.bulletins : {};
    const b8 = bulletins["8"];

    if (!b8 || !b8.url) {
      setDorostMsg("⚠️ Chybí zpravodaj 8. kola (bulletins['8']). Nejdřív ulož 8. kolo.");
      return;
    }

    const histRef = doc(db, "team_history", "DOROST", "seasons", seasonId);
    const histSnap = await getDoc(histRef);

    if (histSnap.exists()) {
      setDorostMsg("ℹ️ Historie pro tuto sezónu už existuje. Nepřepisuji.");
      return;
    }

    await setDoc(histRef, {
      seasonId,
      createdAt: new Date().toISOString(),
      summaryBulletin: {
        round: 8,
        title: b8.title || "8. kolo (souhrn)",
        url: b8.url
      }
    });

    setDorostMsg(`✅ Uloženo do historie: Dorost / ${seasonId} (jen 8. kolo).`);
  } catch (e) {
    console.error("DorostToHistory error:", e);
    setDorostMsg("❌ Přenos do historie selhal – koukni do Console (F12).");
  }
});

// Dorost návod (dorost-navod.txt)
btnDorostGuide?.addEventListener("click", async () => {
  if (!dorostGuideBox) return;

  // toggle: když je vidět, schovej
  if (dorostGuideBox.style.display !== "none" && dorostGuideBox.style.display !== "") {
    dorostGuideBox.style.display = "none";
    return;
  }

  dorostGuideBox.style.display = "block";
  dorostGuideBox.textContent = "Načítám návod…";

  try {
    const res = await fetch("./dorost-navod.txt?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const txt = await res.text();
    dorostGuideBox.textContent = txt;
  } catch (e) {
    console.error(e);
    dorostGuideBox.textContent = "Nelze načíst dorost-navod.txt (zkontroluj, že soubor existuje v repu).";
  }
});

/* =========================================================
   A/B/C: sezóna + načtení + nová sezóna + future ukládání
   Firestore: team_current/{A|B|C}
     { seasonId, future{}, past{}, teams[], updatedAt }
   ========================================================= */

const abcTeam = document.getElementById("abcTeam");
const abcSeason = document.getElementById("abcSeason");
const btnAbcLoad = document.getElementById("btnAbcLoad");
const btnAbcNewSeason = document.getElementById("btnAbcNewSeason");
const btnAbcClearSeason = document.getElementById("btnAbcClearSeason");

const btnSaveFuture = document.getElementById("btnSaveFuture");
const btnSavePast = document.getElementById("btnSavePast");
const btnAbcToHistory = document.getElementById("btnAbcToHistory");
const btnAbcGuide = document.getElementById("btnAbcGuide");

const abcMsg = document.getElementById("abcMsg");
const abcGuideBox = document.getElementById("abcGuideBox");

const fRound = document.getElementById("fRound");
const fDate  = document.getElementById("fDate");
const fHome  = document.getElementById("fHome"); // select
const fAway  = document.getElementById("fAway"); // select

const pRound = document.getElementById("pRound");
const pDate  = document.getElementById("pDate");
const pHome  = document.getElementById("pHome"); // select
const pAway  = document.getElementById("pAway"); // select
const pResult= document.getElementById("pResult");
const pPins  = document.getElementById("pPins");

function setAbcMsg(txt) {
  if (abcMsg) abcMsg.textContent = txt || "";
}

function countKeys(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj).length : 0;
}

async function loadAbcCurrent(teamId) {
  setAbcMsg("⏳ Načítám…");
  try {
    const ref = doc(db, "team_current", teamId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setAbcMsg(`ℹ️ Dokument team_current/${teamId} neexistuje.`);
      return;
    }

    const data = snap.data();
    if (abcSeason) abcSeason.value = data.seasonId || (abcSeason.value || "");

    const fCount = countKeys(data.future);
    const pCount = countKeys(data.past);
    setAbcMsg(`✅ Načteno: sezóna ${data.seasonId || "?"} | budoucí kola: ${fCount} | minulá kola: ${pCount}`);

    // pokud existují teams, naplň roletky
    if (Array.isArray(data.teams)) fillTeamSelects(data.teams);
  } catch (e) {
    console.error(e);
    setAbcMsg("❌ Načtení selhalo (zkontroluj přihlášení / Rules).");
  }
}

async function createNewAbcSeason(teamId, seasonId) {
  if (!seasonId) {
    setAbcMsg("⚠️ Vyplň název sezóny (např. 2025-2026).");
    return;
  }

  setAbcMsg("⏳ Vytvářím novou sezónu (vyčistím future/past)…");
  try {
    const ref = doc(db, "team_current", teamId);
    await setDoc(ref, {
      seasonId,
      updatedAt: new Date().toISOString(),
      future: {},
      past: {}
    }, { merge: true });

    setAbcMsg(`✅ Nová sezóna vytvořena: ${teamId} / ${seasonId}`);
  } catch (e) {
    console.error(e);
    setAbcMsg("❌ Vytvoření sezóny selhalo (zkontroluj přihlášení / Rules).");
  }
}

btnAbcLoad?.addEventListener("click", () => {
  const teamId = abcTeam?.value || "A";
  loadAbcCurrent(teamId);
});

btnAbcNewSeason?.addEventListener("click", () => {
  const teamId = abcTeam?.value || "A";
  const seasonId = (abcSeason?.value || "").trim();
  if (!confirm(`Vytvořit novou sezónu pro ${teamId} (${seasonId})?\nVymaže future/past v team_current/${teamId}.`)) return;
  createNewAbcSeason(teamId, seasonId);
});

btnAbcClearSeason?.addEventListener("click", () => {
  setAbcMsg("ℹ️ Mazání sezóny doděláme v dalším kroku.");
});

// Uložit budoucí kolo (future["kolo"])
btnSaveFuture?.addEventListener("click", async () => {
  try {
    const teamId = abcTeam?.value || "A";

    const roundNum = Number(fRound?.value || "");
    const roundKey = String(roundNum);

    const date = (fDate?.value || "").trim();
    const home = (fHome?.value || "").trim();
    const away = (fAway?.value || "").trim();

    if (!roundNum || roundNum < 1 || !Number.isFinite(roundNum)) {
      setAbcMsg("⚠️ Vyplň kolo (číslo >= 1).");
      return;
    }
    if (!date) {
      setAbcMsg("⚠️ Vyplň datum.");
      return;
    }
    if (!home || !away) {
      setAbcMsg("⚠️ Vyber domácí i hosté (roletky).");
      return;
    }

    setAbcMsg(`⏳ Ukládám budoucí kolo ${roundKey} pro ${teamId}…`);

    const ref = doc(db, "team_current", teamId);

    // merge: aktualizuje jen future[roundKey]
    await setDoc(ref, {
      updatedAt: new Date().toISOString(),
      future: {
        [roundKey]: {
          round: roundNum,
          date,
          home,
          away
        }
      }
    }, { merge: true });

    setAbcMsg(`✅ Uloženo: ${roundKey}. kolo (${date}) ${home} - ${away}`);

    if (fRound) fRound.value = "";
    if (fDate) fDate.value = "";

    await loadAbcCurrent(teamId);
  } catch (e) {
    console.error(e);
    setAbcMsg("❌ Uložení budoucího kola selhalo (zkontroluj přihlášení / Rules).");
  }
});


btnSavePast?.addEventListener("click", async () => {
  try {
    const teamId = abcTeam?.value || "A";

    const roundNum = Number(pRound?.value || "");
    const roundKey = String(roundNum);

    const date = (pDate?.value || "").trim();
    const home = (pHome?.value || "").trim(); // select
    const away = (pAway?.value || "").trim(); // select
    const result = (pResult?.value || "").trim(); // např. 6:2
    const pins = (pPins?.value || "").trim();     // např. 3404:3247

    if (!roundNum || roundNum < 1 || !Number.isFinite(roundNum)) {
      setAbcMsg("⚠️ Vyplň kolo (číslo >= 1).");
      return;
    }
    if (!date) {
      setAbcMsg("⚠️ Vyplň datum.");
      return;
    }
    if (!home || !away) {
      setAbcMsg("⚠️ Vyber domácí i hosté (roletky).");
      return;
    }
    if (!result) {
      setAbcMsg("⚠️ Vyplň výsledek (např. 6:2).");
      return;
    }
    if (!pins) {
      setAbcMsg("⚠️ Vyplň kuželky (např. 3404:3247).");
      return;
    }

    // jednoduchá kontrola formátu (kvůli překlepům)
    if (!/^\d+(?:[.,]\d+)?:\d+(?:[.,]\d+)?$/.test(result.replace(/\s+/g, ""))) {
      setAbcMsg("⚠️ Výsledek má špatný formát (např. 6:2 nebo 5,5:2,5).");
      return;
    }
    if (!/^\d{3,4}:\d{3,4}$/.test(pins.replace(/\s+/g, ""))) {
      setAbcMsg("⚠️ Kuželky mají špatný formát (např. 3404:3247).");
      return;
    }

    setAbcMsg(`⏳ Ukládám minulý zápas ${roundKey}. kolo pro ${teamId}…`);

    const ref = doc(db, "team_current", teamId);

    // ✅ uloží past[roundKey] bez smazání ostatních kol
    await setDoc(ref, {
      updatedAt: new Date().toISOString(),
      past: {
        [roundKey]: {
          round: roundNum,
          date,
          home,
          away,
          result: result.replace(/\s+/g, ""),
          pins: pins.replace(/\s+/g, "")
        }
      }
    }, { merge: true });

    setAbcMsg(`✅ Uloženo: ${roundKey}. kolo (${date}) ${home} - ${away} ${result} ${pins}`);

    // volitelně vyčistit vstupy
    if (pRound) pRound.value = "";
    if (pDate) pDate.value = "";
    if (pResult) pResult.value = "";
    if (pPins) pPins.value = "";

    // načti zpět a ukaž počty kol
    await loadAbcCurrent(teamId);
  } catch (e) {
    console.error(e);
    setAbcMsg("❌ Uložení minulého kola selhalo (zkontroluj přihlášení / Rules).");
  }
});

// ====== A/B/C: Archivace do historie (tabulka + zápasy) ======
btnAbcToHistory?.addEventListener("click", async () => {
  try {
    const teamId = abcTeam?.value || "A";
    const seasonId = (abcSeason?.value || "").trim();

    if (!seasonId) {
      setAbcMsg("⚠️ Vyplň sezónu (např. 2025-2026).");
      return;
    }

    setAbcMsg("⏳ Archivuju tabulku + zápasy do historie…");

    // 1) Načti aktuální tabulku z JSON (GitHub Pages)
    const res = await fetch(`./data/teams/${teamId}.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      setAbcMsg(`❌ Nelze načíst data/teams/${teamId}.json (HTTP ${res.status}).`);
      return;
    }
    const feed = await res.json();
    const table = feed?.table;

    if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows) || table.rows.length === 0) {
      setAbcMsg("⚠️ Tabulka v JSON je prázdná – nejdřív musí být načtená tabulka.");
      return;
    }

    // 2) Firestore neumí array-of-arrays -> rows převedeme na array-of-objects {c0,c1,...}
    const cols = table.columns;
    const rowsObjects = table.rows.map((row, idx) => {
      const obj = { _i: idx };
      const arr = Array.isArray(row) ? row : [];
      for (let i = 0; i < cols.length; i++) obj["c" + i] = (arr[i] ?? "").toString();
      return obj;
    });

    // 3) Načti snapshot zápasů (past) z team_current/{teamId}
    const curRef = doc(db, "team_current", teamId);
    const curSnap = await getDoc(curRef);
    const curData = curSnap.exists() ? curSnap.data() : {};
    const pastMap = (curData.past && typeof curData.past === "object") ? curData.past : {};

    const pastList = Object.keys(pastMap).map(k => {
      const it = pastMap[k] || {};
      return {
        round: Number(it.round ?? k),
        date: it.date || "",
        home: it.home || "",
        away: it.away || "",
        result: it.result || "",
        pins: it.pins || ""
      };
    })
    .filter(m => m.round && m.date && m.home && m.away)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

    // 4) Historie: nepřepisovat
    const histRef = doc(db, "team_history", teamId, "seasons", seasonId);
    const histSnap = await getDoc(histRef);
    if (histSnap.exists()) {
      setAbcMsg("ℹ️ Historie pro tuto sezónu už existuje. Nepřepisuji.");
      return;
    }

    // 5) Ulož snapshot tabulky + zápasů
    await setDoc(histRef, {
      seasonId,
      archivedAt: new Date().toISOString(),
      finalTable: { columns: cols, rows: rowsObjects },
      pastList
    });

    setAbcMsg(`✅ Uloženo do historie: ${teamId} / ${seasonId} (tabulka + zápasy).`);
  } catch (e) {
    console.error(e);
    setAbcMsg("❌ Archivace selhala (koukni do Console F12).");
  }
});

// ---- A/B/C návod (načtení z abc-navod.txt) ----
btnAbcGuide?.addEventListener("click", async () => {
  if (!abcGuideBox) return;

  // toggle: když je vidět, schovej
  if (abcGuideBox.style.display !== "none" && abcGuideBox.style.display !== "") {
    abcGuideBox.style.display = "none";
    return;
  }

  abcGuideBox.style.display = "block";
  abcGuideBox.textContent = "Načítám návod…";

  try {
    const res = await fetch("./abc-navod.txt?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const txt = await res.text();
    abcGuideBox.textContent = txt;
  } catch (e) {
    console.error(e);
    abcGuideBox.textContent = "Nelze načíst abc-navod.txt (zkontroluj, že soubor existuje v repu).";
  }
});


/* =========================================================
   A/B/C: editor seznamu týmů + naplnění roletek (SINGLE BLOCK)
   (pozor: fillTeamSelects je definováno ZDE jen 1×)
   ========================================================= */

const btnTeamsEditor = document.getElementById("btnTeamsEditor");
const teamsEditorBox = document.getElementById("teamsEditorBox");
const teamsTextarea  = document.getElementById("teamsTextarea");
const btnTeamsSave   = document.getElementById("btnTeamsSave");
const btnTeamsLoad   = document.getElementById("btnTeamsLoad");
const teamsMsg       = document.getElementById("teamsMsg");

function setTeamsMsg(txt) {
  if (teamsMsg) teamsMsg.textContent = txt || "";
}

// Naplní roletky fHome/fAway/pHome/pAway z pole teams[]
function fillTeamSelects(teams) {
  const fHomeSel = document.getElementById("fHome");
  const fAwaySel = document.getElementById("fAway");
  const pHomeSel = document.getElementById("pHome");
  const pAwaySel = document.getElementById("pAway");

  const selects = [fHomeSel, fAwaySel, pHomeSel, pAwaySel].filter(Boolean);

  // reset
  for (const sel of selects) {
    sel.innerHTML = "";
    sel.appendChild(new Option("— vyber tým —", ""));
  }

  if (!Array.isArray(teams) || teams.length === 0) return;

  // options
  for (const t of teams) {
    const name = (t || "").trim();
    if (!name) continue;
    for (const sel of selects) {
      sel.appendChild(new Option(name, name));
    }
  }
}

btnTeamsEditor?.addEventListener("click", () => {
  if (!teamsEditorBox) return;

  const isHidden = (teamsEditorBox.style.display === "none" || teamsEditorBox.style.display === "");
  teamsEditorBox.style.display = isHidden ? "block" : "none";

  if (isHidden) {
    setTeamsMsg("ℹ️ Editor otevřen.");
    setTimeout(() => teamsTextarea?.focus(), 0);
  } else {
    setTeamsMsg("");
  }
});

btnTeamsSave?.addEventListener("click", async () => {
  try {
    const teamId = document.getElementById("abcTeam")?.value || "A";
    const raw = (teamsTextarea?.value || "");

    const lines = raw
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const unique = Array.from(new Set(lines));

    if (unique.length === 0) {
      setTeamsMsg("⚠️ Seznam je prázdný – vlož alespoň 1 tým.");
      return;
    }

    setTeamsMsg(`⏳ Ukládám ${unique.length} týmů do team_current/${teamId}…`);

    const ref = doc(db, "team_current", teamId);
    await setDoc(ref, {
      updatedAt: new Date().toISOString(),
      teams: unique
    }, { merge: true });

    setTeamsMsg(`✅ Uloženo: ${unique.length} týmů.`);
    fillTeamSelects(unique);
  } catch (e) {
    console.error(e);
    setTeamsMsg("❌ Uložení selhalo (zkontroluj přihlášení / Rules).");
  }
});

btnTeamsLoad?.addEventListener("click", async () => {
  try {
    const teamId = document.getElementById("abcTeam")?.value || "A";
    setTeamsMsg(`⏳ Načítám team_current/${teamId}.teams…`);

    const ref = doc(db, "team_current", teamId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setTeamsMsg(`⚠️ team_current/${teamId} neexistuje.`);
      return;
    }

    const data = snap.data();
    const teams = Array.isArray(data.teams) ? data.teams : [];

    if (teamsTextarea) teamsTextarea.value = teams.join("\n");
    fillTeamSelects(teams);

    setTeamsMsg(teams.length ? `✅ Načteno: ${teams.length} týmů.` : "ℹ️ Nejsou uložené žádné týmy.");
  } catch (e) {
    console.error(e);
    setTeamsMsg("❌ Načtení selhalo (zkontroluj přihlášení / Rules).");
  }
});
