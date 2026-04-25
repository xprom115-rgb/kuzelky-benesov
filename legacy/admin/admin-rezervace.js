// =========================================================
// admin-rezervace.js
// - Firebase Authentication (Email/Password)
// - po přihlášení zobrazí #admin-panel a schová #admin-login
// - po odhlášení naopak
// =========================================================

import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ---------------------------------------------------------
// DOM: login formulář
// ---------------------------------------------------------
const loginBox = document.getElementById("admin-login");
const emailEl  = document.getElementById("admin-email");
const passEl   = document.getElementById("admin-pass");
const btnLogin = document.getElementById("admin-login-btn");
const loginMsg = document.getElementById("admin-login-msg");

// ---------------------------------------------------------
// DOM: admin panel rezervací (tvůj původní obsah)
// ---------------------------------------------------------
const panelBox  = document.getElementById("admin-panel");
const btnLogout = document.getElementById("admin-logout-btn");

// ---------------------------------------------------------
// Helper: zpráva pod loginem
// ---------------------------------------------------------
function setMsg(text) {
  if (loginMsg) loginMsg.textContent = text || "";
}

// ---------------------------------------------------------
// Helper: přepínání UI podle přihlášení
// ---------------------------------------------------------
function showPanel(isLoggedIn) {
  if (loginBox) loginBox.style.display = isLoggedIn ? "none" : "";
  if (panelBox) panelBox.style.display = isLoggedIn ? "" : "none";
}

// schovej panel okamžitě při načtení stránky (aby nebyl „flash“)
showPanel(false);

// ---------------------------------------------------------
// LOGIN: klik na Přihlásit
// ---------------------------------------------------------
btnLogin?.addEventListener("click", async () => {
  const email = (emailEl?.value || "").trim();
  const pass  = (passEl?.value || "");

  if (!email || !pass) {
    setMsg("⚠️ Zadej email i heslo.");
    return;
  }

  try {
    setMsg("⏳ Přihlašuji…");
    await signInWithEmailAndPassword(auth, email, pass);
    setMsg("✅ Přihlášeno.");
    // Zobrazení panelu se udělá přes onAuthStateChanged níže
  } catch (e) {
    console.error(e);
    setMsg("❌ Přihlášení se nepovedlo (zkontroluj email/heslo).");
  }
});

// ---------------------------------------------------------
// LOGOUT: klik na Odhlásit
// ---------------------------------------------------------
btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error(e);
  }
});

// ---------------------------------------------------------
// AUTH STATE: kdykoli se změní stav přihlášení
// ---------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  showPanel(!!user);
  if (!user) setMsg("");
});
