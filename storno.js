import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";
import {
    collection, query, where, getDocs, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import { db } from "./firebase-config.js";
import {
  collection, query, where, getDocs, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// Už NIC nepředvyplňujeme z URL – zákazník musí zadat kód ručně.

async function cancelReservation(){
  const code = document.getElementById("code").value.trim().toUpperCase();
  if (!code){ alert("Zadejte kód."); return; }

  const q = query(collection(db,"reservations"), where("id","==",code));
  const snap = await getDocs(q);

  if (snap.empty){
    show("❌ Rezervace nenalezena","Zkontrolujte, zda jste zadali správný kód.");
    return;
  }

  for (const d of snap.docs){
    await deleteDoc(doc(db,"reservations", d.id));
  }

  show("✅ Rezervace byla zrušena","Termín je nyní opět volný.");
}

function show(title,text){
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-text").textContent = text;
  document.getElementById("result-box").style.display="block";
}

document.getElementById("btn-cancel").addEventListener("click", cancelReservation);
``

async function cancelReservation(){
    const code = document.getElementById("code").value.trim().toUpperCase();
    if (!code){ alert("Zadejte kód."); return; }

    const q = query(collection(db,"reservations"), where("id","==",code));
    const snap = await getDocs(q);

    if (snap.empty){
        show("❌ Rezervace nenalezena","Zkontrolujte, zda jste zadali správný kód.");
        return;
    }

    for (const d of snap.docs){
        await deleteDoc(doc(db,"reservations", d.id));
    }

    show("✅ Rezervace byla zrušena","Termín je nyní opět volný.");
}

function show(title,text){
    document.getElementById("result-title").textContent = title;
    document.getElementById("result-text").textContent = text;
    document.getElementById("result-box").style.display="block";
}

document.getElementById("btn-cancel").addEventListener("click", cancelReservation);
