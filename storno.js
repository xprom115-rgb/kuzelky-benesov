// storno.js
import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";
import {
    collection,
    query,
    where,
    getDocs,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ---------------------------------------------------
// 1) Pokud je v URL ?id=XXXX → automaticky vyplnit
// ---------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const passedCode = urlParams.get("id");

if (passedCode) {
    document.getElementById("code").value = passedCode;
}

// ---------------------------------------------------
// 2) Funkce pro zrušení rezervace
// ---------------------------------------------------
async function cancelReservation() {
    const code = document.getElementById("code").value.trim().toUpperCase();

    if (!code || code.length < 3) {
        alert("Zadejte platný kód rezervace.");
        return;
    }

    // Vyhledat rezervaci podle ID (kódu)
    const q = query(
        collection(db, "reservations"),
        where("id", "==", code)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        showResult("❌ Rezervace nenalezena", "Zadaný kód není platný.");
        return;
    }

    // Smazat nalezené rezervace (měla by být vždy jen jedna)
    for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, "reservations", docSnap.id));
    }

    showResult("✅ Rezervace byla zrušena", "Termín je nyní opět volný.");
}

// ---------------------------------------------------
// 3) Zobrazení výsledku
// ---------------------------------------------------
function showResult(title, text) {
    const box = document.getElementById("result-box");
    document.getElementById("result-title").textContent = title;
    document.getElementById("result-text").textContent = text;
    box.style.display = "block";
}

// ---------------------------------------------------
// 4) Udalost po kliknutí na tlačítko
// ---------------------------------------------------
document.getElementById("btn-cancel").addEventListener("click", cancelReservation);