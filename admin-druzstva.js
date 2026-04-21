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
