// =========================================================
// storno.js
//
// CO TO DĚLÁ:
// - uživatel ručně zadá kód rezervace (pole "id" v dokumentu reservations)
// - skript vyhledá odpovídající dokument(y) a smaže je
// - zobrazí hlášku o úspěchu / neúspěchu
//
// POZNÁMKY:
// - kód se NEbere z URL (dle tvého požadavku)
// - když by existovalo více dokumentů se stejným kódem, smažou se všechny (bezpečný fallback)
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- Debug přepínač (když někdy budeš chtít logovat) ---
const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }

// --- DOM prvky ---
const codeInput = document.getElementById("code");
const btnCancel = document.getElementById("btn-cancel");

const resultBox = document.getElementById("result-box");
const resultTitle = document.getElementById("result-title");
const resultText = document.getElementById("result-text");

// --- Pomocná funkce: zobraz výsledek ---
function show(title, text) {
  resultTitle.textContent = title;
  resultText.textContent = text;
  resultBox.style.display = "block";
  // posun na výsledek (komfort)
  resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- Pomocná funkce: normalizace kódu ---
function normalizeCode(s) {
  return (s || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

// --- Hlavní akce: storno rezervace ---
async function cancelReservation() {
  const code = normalizeCode(codeInput?.value);

  // UX: automaticky zobrazení normalizovaného kódu zpět do inputu
  if (codeInput) codeInput.value = code;

  if (!code) {
    alert("Zadejte kód rezervace.");
    return;
  }

  // jednoduchá kontrola délky (tvoje kódy jsou 6 znaků)
  if (code.length < 4) {
    alert("Kód vypadá příliš krátký. Zkontrolujte ho prosím.");
    return;
  }

  // během práce zablokujeme tlačítko
  const oldText = btnCancel?.textContent || "Zrušit rezervaci";
  if (btnCancel) {
    btnCancel.disabled = true;
    btnCancel.textContent = "Pracuji…";
    btnCancel.style.opacity = "0.8";
    btnCancel.style.cursor = "not-allowed";
  }

  try {
    // Najdi dokumenty, kde id == kód
    const q = query(collection(db, "reservations"), where("id", "==", code));
    const snap = await getDocs(q);

    if (snap.empty) {
      show("❌ Rezervace nenalezena", "Zkontrolujte, zda jste zadali správný kód.");
      return;
    }

    // Smazat všechny nalezené (měla by být jen jedna)
    let deleted = 0;
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "reservations", d.id));
      deleted++;
    }

    log("deleted docs:", deleted);
    show("✅ Rezervace byla zrušena", "Termín je nyní opět volný.");
  } catch (e) {
    console.error(e);
    show("❌ Chyba", "Nepodařilo se rezervaci zrušit. Zkuste to prosím znovu.");
  } finally {
    // vrať tlačítko do původního stavu
    if (btnCancel) {
      btnCancel.disabled = false;
      btnCancel.textContent = oldText;
      btnCancel.style.opacity = "";
      btnCancel.style.cursor = "pointer";
    }
  }
}

// --- Události ---
// Klik na tlačítko
btnCancel?.addEventListener("click", cancelReservation);

// Enter v inputu = storno
codeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    cancelReservation();
  }
});

// Fokus na input po načtení (komfort)
window.addEventListener("load", () => {
  codeInput?.focus();
});
