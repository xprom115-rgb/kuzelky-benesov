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

/* ---------------------------
   LOGIN (Auth)
---------------------------- */

const loginBox = document.getElementById("loginBox");
const appBox = document.getElementById("appBox");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const dorostSeason = document.getElementById("dorostSeason");
const btnDorostToHistory = document.getElementById("btnDorostToHistory");
const loginMsg = document.getElementById("loginMsg");

function setLoginMsg(txt) {
  if (loginMsg) loginMsg.textContent = txt || "";
}

function showApp(isLoggedIn) {
  if (loginBox) loginBox.style.display = isLoggedIn ? "none" : "";
  if (appBox) appBox.style.display = isLoggedIn ? "" : "none";
}

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

/* ---------------------------
   DOROST: ZPRAVODAJE (URL)
   Ukládá se do Firestore:
   team_manual/DOROST
   {
     bulletins: {
       "1": { title:"1. kolo", url:"https://...pdf" },
       ...
     }
   }
---------------------------- */

const dorostRound = document.getElementById("dorostRound");
const dorostPdfUrl = document.getElementById("dorostPdfUrl");

const btnSaveDorostPdf = document.getElementById("btnSaveDorostPdf");
const btnLoadDorostPdfs = document.getElementById("btnLoadDorostPdfs");
const btnClearDorostPdfs = document.getElementById("btnClearDorostPdfs");

const dorostMsg = document.getElementById("dorostMsg");
const dorostList = document.getElementById("dorostList");

function setDorostMsg(txt) {
  if (dorostMsg) dorostMsg.textContent = txt || "";
}

function renderDorostList(bulletinsMap) {
  if (!dorostList) return;

  if (!bulletinsMap || typeof bulletinsMap !== "object") {
    dorostList.innerHTML = "<em>Zatím nejsou uložené žádné zpravodaje.</em>";
    return;
  }

  const rounds = Object.keys(bulletinsMap).sort((a, b) => Number(a) - Number(b));
  if (rounds.length === 0) {
    dorostList.innerHTML = "<em>Zatím nejsou uložené žádné zpravodaje.</em>";
    return;
  }

  dorostList.innerHTML = rounds.map((r) => {
    const it = bulletinsMap[r] || {};
    const title = it.title || `${r}. kolo`;
    const url = it.url || "";

    if (!url) return `<div>${r}. kolo: <em>(bez URL)</em></div>`;
    return `<div>${r}. kolo: <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></div>`;
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
    renderDorostList(data.bulletins);
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

    if (Number(round) < 1 || Number(round) > 8) {
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
    bulletins[String(round)] = { title: `${round}. kolo`, url };

    await setDoc(ref, {
      updatedAt: new Date().toISOString(),
      bulletins
    }, { merge: true });

    await loadDorostBulletins();

    if (dorostPdfUrl) dorostPdfUrl.value = "";
    setDorostMsg(`✅ Uloženo: ${round}. kolo`);
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
btnDorostToHistory?.addEventListener("click", async () => {
  try {
    const seasonId = (dorostSeason?.value || "").trim();
    if (!seasonId) {
      setDorostMsg("⚠️ Vyplň sezónu (např. 2025-2026).");
      return;
    }

    setDorostMsg("⏳ Připravuji archiv…");

    // 1) načti ručně spravované zpravodaje
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

    // 2) cíl historie (subkolekce seasons)
    const histRef = doc(db, "team_history", "DOROST", "seasons", seasonId);
    const histSnap = await getDoc(histRef);

    if (histSnap.exists()) {
      setDorostMsg("ℹ️ Historie pro tuto sezónu už existuje. Nepřepisuji.");
      return;
    }

    // 3) ulož pouze souhrnný zpravodaj 8. kola
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
    console.error(e);
    setDorostMsg("❌ Přenos do historie selhal (zkontroluj Rules / přihlášení).");
  }
});
// ====== DOROST: Přenést souhrn (8. kolo) do historie – pojistný handler ======
const dorostSeason2 = document.getElementById("dorostSeason");
const btnDorostToHistory2 = document.getElementById("btnDorostToHistory");

btnDorostToHistory2?.addEventListener("click", async () => {
  // ✅ okamážitá hláška = důkaz, že klik funguje
  setDorostMsg("🟡 Klik zachycen – přenáším do historie…");

  try {
    const seasonId = (dorostSeason2?.value || "").trim();
    if (!seasonId) {
      setDorostMsg("⚠️ Vyplň sezónu (např. 2025-2026).");
      return;
    }

    // načti ručně spravované zpravodaje
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

    // cíl historie
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
// ---- Dorost návod (načtení z dorost-navod.txt) ----
const btnDorostGuide = document.getElementById("btnDorostGuide");
const dorostGuideBox = document.getElementById("dorostGuideBox");

btnDorostGuide?.addEventListener("click", async () => {
  if (!dorostGuideBox) return;

  // toggle: když je vidět, schovej
  if (dorostGuideBox.style.display !== "none") {
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

// ====== A/B/C: sezóna + načítání / vytvoření sezóny (KROK 3) ======
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
const fHome  = document.getElementById("fHome");
const fAway  = document.getElementById("fAway");

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

// --- eventy ---
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

// zatím stuby (další kroky)
btnAbcClearSeason?.addEventListener("click", () => {
  setAbcMsg("ℹ️ Mazání sezóny doděláme v dalším kroku (teď jen Načíst + Nová sezóna).");
});

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
      setAbcMsg("⚠️ Vyplň domácí i hosté.");
      return;
    }

    setAbcMsg(`⏳ Ukládám budoucí kolo ${roundKey} pro ${teamId}…`);

    const ref = doc(db, "team_current", teamId);

    // ✅ merge: přidá/aktualizuje future["kolo"] bez smazání ostatních kol
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

    // volitelně vyčistit inputy
    if (fRound) fRound.value = "";
    if (fDate) fDate.value = "";
    if (fHome) fHome.value = "";
    if (fAway) fAway.value = "";

    // ať hned vidíš počet kol
    await loadAbcCurrent(teamId);
  } catch (e) {
    console.error(e);
    setAbcMsg("❌ Uložení budoucího kola selhalo (zkontroluj přihlášení / Rules).");
  }
});
``

btnSavePast?.addEventListener("click", () => {
  setAbcMsg("ℹ️ Uložení minulého kola doděláme v dalším kroku.");
});

btnAbcToHistory?.addEventListener("click", () => {
  setAbcMsg("ℹ️ Přenos do historie doděláme v dalším kroku (snapshot).");
});

btnAbcGuide?.addEventListener("click", () => {
  if (!abcGuideBox) return;
  abcGuideBox.style.display = (abcGuideBox.style.display === "none" || !abcGuideBox.style.display) ? "block" : "none";
  if (abcGuideBox.style.display === "block") {
    abcGuideBox.textContent = "Návod pro A/B/C doplníme v dalším kroku (stejně jako dorost).";
  }
});
// ====== A/B/C: editor seznamu týmů – pouze rozbalení/sbalení (KROK) ======
const btnTeamsEditor = document.getElementById("btnTeamsEditor");
const teamsEditorBox = document.getElementById("teamsEditorBox");
const teamsTextarea = document.getElementById("teamsTextarea");
const btnTeamsSave = document.getElementById("btnTeamsSave");
const btnTeamsLoad = document.getElementById("btnTeamsLoad");
const teamsMsg = document.getElementById("teamsMsg");

function setTeamsMsg(txt) {
  if (teamsMsg) teamsMsg.textContent = txt || "";
}

btnTeamsEditor?.addEventListener("click", () => {
  if (!teamsEditorBox) return;

  // přepínač zobrazení
  const isHidden = (teamsEditorBox.style.display === "none" || teamsEditorBox.style.display === "");
  teamsEditorBox.style.display = isHidden ? "block" : "none";

  if (isHidden) {
    setTeamsMsg("ℹ️ Editor otevřen. (Ukládání/načítání doděláme v dalším kroku.)");
    // focus do textarea (komfort)
    setTimeout(() => teamsTextarea?.focus(), 0);
  } else {
    setTeamsMsg("");
  }
});

function fillTeamSelects(teams) {
  const fHomeSel = document.getElementById("fHome");
  const fAwaySel = document.getElementById("fAway");
  const pHomeSel = document.getElementById("pHome");
  const pAwaySel = document.getElementById("pAway");

  const selects = [fHomeSel, fAwaySel, pHomeSel, pAwaySel].filter(Boolean);

  // reset na výchozí stav
  selects.forEach(sel => {
    const current = sel.value; // necháme si případný aktuální výběr
    sel.innerHTML = `<option value="">— vyber tým —</option>`;
    sel.value = ""; // reset
    sel.dataset.prev = current; // uložíme pro případné obnovení
  });

  if (!Array.isArray(teams) || teams.length === 0) return;

  // doplnění možností
  const optionsHtml = teams.map(t => {
    const safe = (t || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    return `<option value="${safe}">${safe}</option>`;
  }).join("");

  selects.forEach(sel => {
    sel.insertAdjacentHTML("beforeend", optionsHtml);

    // když byl dřív vybraný tým, zkus ho obnovit
    const prev = sel.dataset.prev || "";
    if (prev && teams.includes(prev)) sel.value = prev;
  });
}
btnTeamsSave?.addEventListener("click", async () => {
  try {
    const teamId = document.getElementById("abcTeam")?.value || "A";
    const raw = (teamsTextarea?.value || "");

    // rozsekej na řádky, ořízni, vyhoď prázdné, odduplikuj
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

    setTeamsMsg(`✅ Uloženo: ${unique.length} týmů (team_current/${teamId}.teams).`);
    fillTeamSelects(unique);
  } catch (e) {
    console.error(e);
    setTeamsMsg("❌ Uložení selhalo (zkontroluj přihlášení / Rules).");
  }
});

btnTeamsLoad?.addEventListener("click", async () => {
 function fillTeamSelects(teams) {
  const fHomeSel = document.getElementById("fHome");
  const fAwaySel = document.getElementById("fAway");
  const pHomeSel = document.getElementById("pHome");
  const pAwaySel = document.getElementById("pAway");

  const selects = [fHomeSel, fAwaySel, pHomeSel, pAwaySel].filter(Boolean);

  // vyčisti roletky
  for (const sel of selects) {
    sel.innerHTML = "";
    sel.appendChild(new Option("— vyber tým —", ""));
  }

  if (!Array.isArray(teams) || teams.length === 0) return;

  // přidej možnosti (bez HTML escapování, přes DOM API)
  for (const t of teams) {
    const name = (t || "").trim();
    if (!name) continue;
    for (const sel of selects) {
      sel.appendChild(new Option(name, name));
    }
  }
}

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

    // ✅ TADY je klíč: naplň roletky
    fillTeamSelects(teams);

    setTeamsMsg(teams.length ? `✅ Načteno: ${teams.length} týmů.` : "ℹ️ Nejsou uložené žádné týmy (teams je prázdné).");
  } catch (e) {
    console.error(e);
    setTeamsMsg("❌ Načtení selhalo (zkontroluj přihlášení / Rules).");
  }
});

    const data = snap.data();
    if (Array.isArray(data.teams)) fillTeamSelects(data.teams);

    if (!teams.length) {
      setTeamsMsg("ℹ️ Nejsou uložené žádné týmy (teams je prázdné).");
      if (teamsTextarea) teamsTextarea.value = "";
      return;
    }

    if (teamsTextarea) teamsTextarea.value = teams.join("\n");
    setTeamsMsg(`✅ Načteno: ${teams.length} týmů.`);
    fillTeamSelects(teams);
  } catch (e) {
    console.error(e);
    setTeamsMsg("❌ Načtení selhalo (zkontroluj přihlášení / Rules).");
  }
});

