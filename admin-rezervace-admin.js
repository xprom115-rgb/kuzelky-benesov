// =========================================================
// admin-rezervace-admin.js
// (JEDEN soubor pro Admin rezervace)
//
// CO TO DĚLÁ:
// 1) Login přes Firebase Auth (Email/Password)
// 2) Po přihlášení spustí realtime listener na kolekci "reservations"
// 3) Umožní smazat 1 rezervaci a udělat úklid do včerejška (batch delete)
// 4) Filtr podle data
// =========================================================

import { db, auth } from "./firebase-config.js";

import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// --------------------
// DOM (ID z admin-rezervace.html)
// --------------------
const loginBox   = document.getElementById("admin-login");
const panelBox   = document.getElementById("admin-panel");

const emailInput = document.getElementById("admin-email");
const passInput  = document.getElementById("admin-pass");
const loginBtn   = document.getElementById("admin-login-btn");
const loginMsg   = document.getElementById("admin-login-msg");
const logoutBtn  = document.getElementById("admin-logout-btn");

const listEl      = document.getElementById("admin-list");
const filterDate  = document.getElementById("filter-date");
const filterClear = document.getElementById("filter-clear");
const cleanupBtn  = document.getElementById("cleanup-old");

// --------------------
// Realtime stav
// --------------------
let unsubscribe = null;
let allRows = []; // [{ docId, data }]

// --------------------
// Helpery
// --------------------
function setMsg(t){ if (loginMsg) loginMsg.textContent = t || ""; }

function showLoggedInUI(on){
  if (loginBox) loginBox.style.display = on ? "none" : "";
  if (panelBox) panelBox.style.display = on ? "block" : "none";
}

function stopRealtime(){
  if (unsubscribe){
    unsubscribe();
    unsubscribe = null;
  }
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sortKey(r){
  const date = r.date || "9999-99-99";
  const start = r.start || "99:99";
  const lane = String(r.lane ?? 9).padStart(2,"0");
  return `${date} ${start} ${lane}`;
}

function formatDate(iso){
  if (!iso || iso.length < 10) return iso || "";
  const [y,m,d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// --------------------
// Render listu rezervací
// --------------------
function render(){
  if (!listEl) return;

  const fd = filterDate?.value || "";

  const rows = (fd ? allRows.filter(x => x.data.date === fd) : allRows.slice())
    .sort((a,b) => sortKey(a.data).localeCompare(sortKey(b.data)));

  if (!rows.length){
    listEl.innerHTML = "<p><em>Žádné rezervace.</em></p>";
    return;
  }

  const html = rows.map(item => {
    const r = item.data;
    const docId = item.docId;

    return `
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.15);">
        <div>
          <strong>${formatDate(r.date)}</strong> —
          Dráha <strong>${r.lane}</strong> —
          <strong>${r.start}–${r.end}</strong> —
          ${r.name || ""}
          <span style="opacity:0.8;">(kód: ${r.id || ""})</span>
        </div>
        <div>
          <button data-del="${docId}" class="btn-danger" type="button"
            style="padding:8px 12px; border-radius:10px; border:0; cursor:pointer;">
            Smazat
          </button>
        </div>
      </div>
    `;
  }).join("");

  listEl.innerHTML = html;

  // napoj delete tlačítka
  listEl.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const docId = btn.getAttribute("data-del");
      if (!docId) return;
      if (!confirm("Opravdu chcete rezervaci smazat?")) return;

      try{
        await deleteDoc(doc(db, "reservations", docId));
      }catch(e){
        console.error(e);
        alert("Nepodařilo se smazat rezervaci.");
      }
    });
  });
}

// --------------------
// Realtime listener
// --------------------
function startRealtime(){
  stopRealtime();

  unsubscribe = onSnapshot(
    collection(db, "reservations"),
    (snap) => {
      allRows = snap.docs.map(d => ({ docId: d.id, data: d.data() }));
      render();
    },
    (err) => {
      console.error(err);
      if (listEl) listEl.innerHTML = "<p><strong>Chyba načítání rezervací.</strong></p>";
    }
  );
}

// --------------------
// Úklid do včerejška (date < today)
// --------------------
async function cleanupToYesterday(){
  if (!auth.currentUser){
    alert("Nejste přihlášen.");
    return;
  }

  const today = todayIso();
  if (!confirm(`Opravdu chcete smazat všechny rezervace do včerejška?\n(Smaže se vše s datem < ${today})`)) return;

  const toDelete = allRows.filter(item => item?.data?.date && item.data.date < today);
  if (toDelete.length === 0){
    alert("Žádné staré rezervace k mazání.");
    return;
  }

  try{
    const BATCH_LIMIT = 450; // rezerva (limit 500)
    let deleted = 0;

    for (let i = 0; i < toDelete.length; i += BATCH_LIMIT){
      const chunk = toDelete.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const item of chunk){
        batch.delete(doc(db, "reservations", item.docId));
      }
      await batch.commit();
      deleted += chunk.length;
    }

    alert(`Smazáno rezervací do včerejška: ${deleted}`);
  }catch(e){
    console.error(e);
    alert("Nepodařilo se smazat staré rezervace. Podívejte se do konzole.");
  }
}

// --------------------
// UI eventy (filtr, úklid)
// --------------------
filterDate?.addEventListener("change", render);
filterClear?.addEventListener("click", () => { if (filterDate) filterDate.value = ""; render(); });
cleanupBtn?.addEventListener("click", cleanupToYesterday);

// --------------------
// Login / Logout (Firebase Auth)
// --------------------
loginBtn?.addEventListener("click", async () => {
  setMsg("");
  const email = (emailInput?.value || "").trim();
  const pass  = (passInput?.value || "");
  if (!email || !pass){ setMsg("Zadejte email i heslo."); return; }

  try{
    setMsg("⏳ Přihlašuji…");
    await signInWithEmailAndPassword(auth, email, pass);
    setMsg("✅ Přihlášeno.");
  }catch(e){
    console.error(e);
    setMsg("Nesprávný email nebo heslo.");
  }
});

logoutBtn?.addEventListener("click", async () => {
  try { await signOut(auth); } catch(e){ console.error(e); }
});

// --------------------
// Auth state: přepínání UI + start/stop realtime
// --------------------
showLoggedInUI(false);

onAuthStateChanged(auth, (user) => {
  showLoggedInUI(!!user);

  if (user) {
    startRealtime();
  } else {
    stopRealtime();
    allRows = [];
    if (listEl) listEl.innerHTML = "<p><em>Žádné rezervace.</em></p>";
  }
});
``
