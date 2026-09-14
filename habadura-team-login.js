// =========================================================
// habadura-team-login.js
//
// Samostatne tymove prihlaseni pro zadavani vysledku Habadury.
// Tento soubor je oddeleny od admin-habadura.js.
//
// V tomto kroku:
// 1) nacte z kolekce teams pouze tymy s poli loginEmail a authUid,
// 2) naplni prihlasovaci roletku,
// 3) prihlasi vybrany tym pres Firebase Authentication,
// 4) po prihlaseni zobrazi sekci #matchEntrySection,
// 5) po odhlaseni zadavaci sekci znovu skryje.
//
// Heslo se nikdy neuklada do Firestore ani do JavaScriptu.
// =========================================================

import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// =========================================================
// DOM prvky z habadura.html
// =========================================================
const loginBox = document.getElementById("teamLoginBox");
const loginSelect = document.getElementById("team-login-select");
const passwordInput = document.getElementById("team-login-password");
const loginButton = document.getElementById("team-login-button");
const loginMessage = document.getElementById("team-login-message");

const matchEntrySection = document.getElementById("matchEntrySection");
const loggedTeamName = document.getElementById("logged-team-name");
const logoutButton = document.getElementById("team-logout-button");

// Tymy dostupne pro prihlaseni.
// Klicem je Firebase UID a hodnotou zaznam tymu.
let loginTeamsByUid = new Map();

// =========================================================
// Pomocne funkce pro UI
// =========================================================
function setLoginMessage(text) {
  if (loginMessage) {
    loginMessage.textContent = text || "";
  }
}

// =========================================================
// Zobrazení stránky po odhlášení
// =========================================================
function showLoggedOutUi() {
  // Odstraníme uložený tým i pomocné atributy stránky.
  window.__habaduraLoggedTeam = null;

  document.body.removeAttribute("data-habadura-team-id");
  document.body.removeAttribute("data-habadura-team-liga");

  if (loginBox) {
    loginBox.hidden = false;
  }

  if (matchEntrySection) {
    matchEntrySection.hidden = true;
  }

  if (loggedTeamName) {
    loggedTeamName.textContent = "—";
  }

  window.dispatchEvent(
    new CustomEvent("habadura-team-changed", {
      detail: {
        team: null
      }
    })
  );
}


  // Informujeme ostatní skripty, že tým byl odhlášen.
  window.dispatchEvent(
    new CustomEvent("habadura-team-changed", {
      detail: {
        team: null
      }
    })
  );
}

  if (matchEntrySection) {
    matchEntrySection.hidden = true;
  }

  if (loggedTeamName) {
    loggedTeamName.textContent = "—";
  }

function showLoggedInUi(team) {
  if (loginBox) {
    loginBox.hidden = true;
  }

  if (matchEntrySection) {
    matchEntrySection.hidden = false;
  }

  if (loggedTeamName) {
    loggedTeamName.textContent = team?.name || "Přihlášený tým";
  }
}

function setLoginButtonBusy(isBusy) {
  if (!loginButton) {
    return;
  }

  loginButton.disabled = isBusy;
  loginButton.textContent = isBusy ? "Přihlašuji…" : "Přihlásit";
}

// =========================================================
// Načtení týmů, které mají vytvořený přihlašovací účet
//
// Očekávaná pole v dokumentu teams/{teamId}:
// - name: název týmu
// - liga: číslo ligy
// - authUid: UID z Firebase Authentication
// - loginEmail: technický přihlašovací e-mail
// =========================================================
async function loadLoginTeams() {
  if (!loginSelect) {
    return;
  }

  loginSelect.innerHTML = '<option value="">— načítám týmy —</option>';
  loginSelect.disabled = true;

  try {
    const snapshot = await getDocs(collection(db, "teams"));

    const loginTeams = snapshot.docs
      .map((teamDocument) => ({
...teamDocument.data(),
id: teamDocument.id
}))
      .filter((team) =>
        typeof team.authUid === "string" &&
        team.authUid.trim() !== "" &&
        typeof team.loginEmail === "string" &&
        team.loginEmail.trim() !== ""
      )
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "cs")
      );

    loginTeamsByUid = new Map(
      loginTeams.map((team) => [team.authUid, team])
    );

    loginSelect.innerHTML = '<option value="">— vyber tým —</option>';

    for (const team of loginTeams) {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name || team.id;
      option.dataset.loginEmail = team.loginEmail;
      loginSelect.appendChild(option);
    }

    loginSelect.disabled = false;

    if (loginTeams.length === 0) {
      setLoginMessage("Zatím není vytvořený žádný týmový účet.");
    }
  } catch (error) {
    console.error("Chyba při načítání týmových účtů:", error);
    loginSelect.innerHTML = '<option value="">— týmy nelze načíst —</option>';
    setLoginMessage("Nepodařilo se načíst seznam týmů.");
  }
}

// =========================================================
// Přihlášení vybraného týmu
// =========================================================
async function loginSelectedTeam() {
  const selectedOption = loginSelect?.selectedOptions?.[0];
  const loginEmail = selectedOption?.dataset?.loginEmail || "";
  const password = passwordInput?.value || "";

  if (!loginEmail) {
    setLoginMessage("Vyber tým.");
    return;
  }

  if (!password) {
    setLoginMessage("Zadej heslo týmu.");
    return;
  }

  setLoginButtonBusy(true);
  setLoginMessage("");

  try {
    await signInWithEmailAndPassword(auth, loginEmail, password);

    if (passwordInput) {
      passwordInput.value = "";
    }
  } catch (error) {
    console.error("Týmové přihlášení se nezdařilo:", error);
    setLoginMessage("Přihlášení se nepovedlo. Zkontroluj tým a heslo.");
  } finally {
    setLoginButtonBusy(false);
  }
}

// =========================================================
// Události přihlášení a odhlášení
// =========================================================
loginButton?.addEventListener("click", loginSelectedTeam);

passwordInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loginSelectedTeam();
  }
});

logoutButton?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Odhlášení týmu se nezdařilo:", error);
  }
});

// =========================================================
// Reakce na stav Firebase Authentication
// =========================================================
onAuthStateChanged(auth, async (user) => {
  // Seznam načteme před vyhodnocením UID, pokud ještě není připravený.
  if (loginTeamsByUid.size === 0) {
    await loadLoginTeams();
  }

  if (!user) {
    showLoggedOutUi();
    return;
  }

  const team = loginTeamsByUid.get(user.uid);

  // Přihlášený účet není přiřazený žádnému týmu Habaďůry.
  // To může nastat například při současném admin přihlášení.
  if (!team) {
    showLoggedOutUi();
    setLoginMessage("Tento účet není přiřazený žádnému týmu Habaďůry.");
    return;
  }

  showLoggedInUi(team);
});

// Výchozí stav při načtení stránky.
showLoggedOutUi();
