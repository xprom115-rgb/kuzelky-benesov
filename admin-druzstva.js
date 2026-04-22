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
