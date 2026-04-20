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
