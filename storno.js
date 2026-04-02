// storno.js (finální)
// - žádné auto-vyplnění kódu z URL
// - mazání podle zadaného kódu (pole "id" v dokumentu)

import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

console.log("✅ storno.js načten");

function show(title, text) {
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-text").textContent = text;
  document.getElementById("result-box").style.display = "block";
}

async function cancelReservation() {
  const code = document.getElementById("code").value.trim().toUpperCase();

  if (!code) {
    alert("Zadejte kód rezervace.");
    return;
  }

  try {
    const q = query(collection(db, "reservations"), where("id", "==", code));
    const snap = await getDocs(q);

    if (snap.empty) {
      show("❌ Rezervace nenalezena", "Zkontrolujte, zda jste zadali správný kód.");
      return;
    }

    // Smazat všechny nalezené (měla by být jen jedna)
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "reservations", d.id));
    }

    show("✅ Rezervace byla zrušena", "Termín je nyní opět volný.");
  } catch (e) {
    console.error(e);
    show("❌ Chyba", "Nepodařilo se rezervaci zrušit. Zkuste to prosím znovu.");
  }
}

document.getElementById("btn-cancel").addEventListener("click", cancelReservation);
