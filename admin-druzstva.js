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

const loginBox = document.getElementById("loginBox");
const appBox = document.getElementById("appBox");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const loginMsg = document.getElementById("loginMsg");

function setMsg(txt) {
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
    setMsg("⚠️ Zadej email i heslo.");
    return;
  }

  try {
    setMsg("⏳ Přihlašuji…");
    await signInWithEmailAndPassword(auth, email, pass);
    setMsg("✅ Přihlášeno.");
  } catch (e) {
    console.error(e);
    setMsg("❌ Přihlášení se nepovedlo (zkontroluj email/heslo).");
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
  if (!user) setMsg("");
});

// ---- DOROST: načítání zpravodajů (KROK 5) ----
const dorostRound = document.getElementById("dorostRound");
const dorostPdf = document.getElementById("dorostPdf");
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

  const rounds = Object.keys(bulletinsMap)
    .sort((a, b) => Number(a) - Number(b));

  if (rounds.length === 0) {
    dorostList.innerHTML = "<em>Zatím nejsou uložené žádné zpravodaje.</em>";
    return;
  }

  dorostList.innerHTML = rounds.map(r => {
    const it = bulletinsMap[r] || {};
    const title = it.title || `${r}. kolo`;
    const url = it.url || "";
    if (!url) return `<div>${r}. kolo: <em>(bez URL)</em></div>`;
    return `<div>${r}. kolo: <a href="${url}" target="_blank" rel="noopener">${title}</a></div>`;
  }).join("");
}

async function loadDorostBulletins() {
  setDorostMsg("⏳ Načítám zpravodaje…");

  try {
    const ref = doc(db, "team_manual", "DOROST");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
  // ✅ auto-vytvoř prázdný dokument, aby už to příště nehlásilo "neexistuje"
  await setDoc(ref, {
    updatedAt: new Date().toISOString(),
    bulletins: {}
  }, { merge: true });

  renderDorostList({});
  setDorostMsg("✅ Dokument vytvořen. Zatím nejsou uložené žádné zpravodaje.");
  return;
}
    }

    const data = snap.data();
    renderDorostList(data.bulletins);
    setDorostMsg("✅ Načteno.");
  } catch (e) {
    console.error(e);
    setDorostMsg("❌ Načtení selhalo (zkontroluj Rules / přihlášení).");
  }
}

// tlačítko „Načíst uložené“
btnLoadDorostPdfs?.addEventListener("click", loadDorostBulletins);

// (zatím neděláme uložení ani mazání – to bude další krok)
btnSaveDorostPdf?.addEventListener("click", () => {
  setDorostMsg("ℹ️ Uložení PDF bude v dalším kroku (zatím jen načítání).");
});

btnClearDorostPdfs?.addEventListener("click", () => {
  setDorostMsg("ℹ️ Mazání bude v dalším kroku (zatím jen načítání).");
});
