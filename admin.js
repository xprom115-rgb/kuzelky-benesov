import { db } from "./firebase-config.js";
import { ADMIN_PASSWORD_HASH } from "./admin-config.js";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// prvky
const loginBox = document.getElementById("admin-login");
const panelBox = document.getElementById("admin-panel");
const passInput = document.getElementById("admin-pass");
const loginBtn = document.getElementById("admin-login-btn");
const loginMsg = document.getElementById("admin-login-msg");
const logoutBtn = document.getElementById("admin-logout-btn");

const listEl = document.getElementById("admin-list");
const filterDate = document.getElementById("filter-date");
const filterClear = document.getElementById("filter-clear");

let unsubscribe = null;
let allRows = [];

// SHA-256 v prohlížeči
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2,"0")).join("");
}

function setLoggedIn(on){
  if (on){
    sessionStorage.setItem("admin_ok", "1");
    loginBox.style.display = "none";
    panelBox.style.display = "block";
    startRealtime();
  } else {
    sessionStorage.removeItem("admin_ok");
    loginBox.style.display = "block";
    panelBox.style.display = "none";
    stopRealtime();
  }
}

function stopRealtime(){
  if (unsubscribe){
    unsubscribe();
    unsubscribe = null;
  }
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

function render(){
  const fd = filterDate.value;

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
          <button data-del="${docId}" style="padding:8px 12px; border-radius:10px; border:0; background:#ffdddd; cursor:pointer;">
            Smazat
          </button>
        </div>
      </div>
    `;
  }).join("");

  listEl.innerHTML = html;

  // navázat delete tlačítka
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

function startRealtime(){
  stopRealtime();
  unsubscribe = onSnapshot(collection(db, "reservations"), (snap) => {
    allRows = snap.docs.map(d => ({ docId: d.id, data: d.data() }));
    render();
  }, (err) => {
    console.error(err);
    listEl.innerHTML = "<p><strong>Chyba načítání rezervací.</strong></p>";
  });
}

// login
loginBtn.addEventListener("click", async () => {
  loginMsg.textContent = "";
  const pass = passInput.value || "";
  if (!pass){ loginMsg.textContent = "Zadejte heslo."; return; }

  const h = await sha256(pass);
  if (h === ADMIN_PASSWORD_HASH){
    setLoggedIn(true);
  } else {
    loginMsg.textContent = "Nesprávné heslo.";
  }
});

// logout
logoutBtn.addEventListener("click", () => setLoggedIn(false));

// filtr
filterDate.addEventListener("change", render);
filterClear.addEventListener("click", () => { filterDate.value = ""; render(); });

// auto login (pokud už je v session)
if (sessionStorage.getItem("admin_ok") === "1"){
  setLoggedIn(true);
}
