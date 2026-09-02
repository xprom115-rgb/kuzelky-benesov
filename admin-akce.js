// =========================================================
// admin-akce.js
// Admin pro zadávání zápasů/turnajů (akce) pro blokaci rezervací a výpis v Aktualitách.
//
// Ukládá do Firestore kolekce: events
// Dokument (events/{eventId}):
// {
//   date:       "YYYY-MM-DD",          // datum akce
//   start:      "HH:MM",              // skutečný čas začátku (pro aktuality)
//   end:        "HH:MM",              // skutečný čas konce (pro aktuality)
//   blockStart: "HH:MM",              // blokace rezervací (zaokrouhleno na hodinu dolů)
//   blockEnd:   "HH:MM",              // blokace rezervací (zaokrouhleno na hodinu nahoru)
//   type:       "match"|"tournament",
//   team:       "A"|"B"|"C"|"DOROST"|null,  // jen pro match
//   title:      string|null,            // jen pro tournament
//   note:       string|null,
//   createdAt:  ISO string
// }
//
// Pozn.: Turnaje i zápasy blokují vždy všechny dráhy (1–4). To řeší až rezervace-events-block.js.
// =========================================================

import { auth, db } from "./firebase-config.js";

// ---- Firebase Auth (login/logout) ----
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ---- Firestore CRUD ----
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// =========================================================
// DOM: Login
// =========================================================
const loginBox = document.getElementById("loginBox");
const appBox   = document.getElementById("appBox");
const emailEl  = document.getElementById("email");
const passEl   = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout= document.getElementById("btnLogout");
const loginMsg = document.getElementById("loginMsg");

// =========================================================
// DOM: Formulář akce
// =========================================================
const evDate = document.getElementById("evDate");
const evStart = document.getElementById("evStart");
const evEnd = document.getElementById("evEnd");
const evType = document.getElementById("evType");

const evTeamWrap = document.getElementById("evTeamWrap");
const evTeam = document.getElementById("evTeam");

const evTitleWrap = document.getElementById("evTitleWrap");
const evTitle = document.getElementById("evTitle");

const evNote = document.getElementById("evNote");
const btnSaveEvent = document.getElementById("btnSaveEvent");
const evMsg = document.getElementById("evMsg");

// =========================================================
// DOM: Seznam akcí
// =========================================================
const btnLoadEvents = document.getElementById("btnLoadEvents");
const eventsList = document.getElementById("eventsList");

// =========================================================
// UI helpery
// =========================================================
function setLoginMsg(txt){ if (loginMsg) loginMsg.textContent = txt || ""; }
function setEvMsg(txt){ if (evMsg) evMsg.textContent = txt || ""; }

function showApp(isLoggedIn){
  if (loginBox) loginBox.style.display = isLoggedIn ? "none" : "";
  if (appBox) appBox.style.display = isLoggedIn ? "" : "none";
}

// Schovej admin část hned po načtení (ať není „flash“)
showApp(false);

// =========================================================
// Časové výpočty (blokace na celou hodinu)
// =========================================================
function pad2(n){ return String(n).padStart(2,"0"); }

function timeToMinutes(hhmm){
  const m = (hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return h*60 + mi;
}

function minutesToTime(mins){
  const m = ((mins % (24*60)) + (24*60)) % (24*60);
  const hh = Math.floor(m/60);
  const mm = m % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function computeBlockWindow(start, end){
  // Skutečný start/end zůstává beze změny.
  // Blokace rezervací je zaokrouhlena na hodiny:
  // - blockStart = floor(start)
  // - blockEnd   = ceil(end)
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;

  const blockStartMin = Math.floor(s / 60) * 60;
  const blockEndMin = (e % 60 === 0) ? e : (Math.floor(e / 60) + 1) * 60;

  return {
    blockStart: minutesToTime(blockStartMin),
    blockEnd: minutesToTime(blockEndMin)
  };
}

// =========================================================
// ID dokumentu – aby nevznikaly duplicity
// =========================================================
function slug(s){
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g,"-")
    .replace(/[^a-z0-9\-]/g,"")
    .slice(0,60) || "akce";
}

function makeEventId({date,start,type,team,title}){
  // např. 2026-04-01_1630_match_A
  const st = (start || "").replace(":","");
  if (type === "match") return `${date}_${st}_match_${team}`;
  return `${date}_${st}_tournament_${slug(title)}`;
}

// =========================================================
// Přepínání UI podle typu akce
// =========================================================
function updateTypeUI(){
  const t = evType?.value || "match";
  if (t === "match") {
    if (evTeamWrap) evTeamWrap.style.display = "";
    if (evTitleWrap) evTitleWrap.style.display = "none";
  } else {
    if (evTeamWrap) evTeamWrap.style.display = "none";
    if (evTitleWrap) evTitleWrap.style.display = "";
  }
}

evType?.addEventListener("change", updateTypeUI);
updateTypeUI();

// =========================================================
// Login / Logout
// =========================================================
btnLogin?.addEventListener("click", async () => {
  const email = (emailEl?.value || "").trim();
  const pass = (passEl?.value || "");
  if (!email || !pass) return setLoginMsg("⚠️ Zadej email i heslo.");

  try{
    setLoginMsg("⏳ Přihlašuji…");
    await signInWithEmailAndPassword(auth, email, pass);
    setLoginMsg("✅ Přihlášeno.");
  } catch(e){
    console.error(e);
    setLoginMsg("❌ Přihlášení se nepovedlo.");
  }
});

btnLogout?.addEventListener("click", async () => {
  try{ await signOut(auth); } catch(e){ console.error(e); }
});

onAuthStateChanged(auth, (user) => {
  showApp(!!user);
  if (!user) setLoginMsg("");
});

// =========================================================
// Uložení akce do Firestore
// =========================================================
btnSaveEvent?.addEventListener("click", async () => {
  try{
    setEvMsg("");

    const date = (evDate?.value || "").trim();
    const start = (evStart?.value || "").trim();
    const end = (evEnd?.value || "").trim();
    const type = evType?.value || "match";
    const note = (evNote?.value || "").trim() || null;

    if (!date || !start || !end) {
      setEvMsg("⚠️ Vyplň datum, od a do.");
      return;
    }

    const win = computeBlockWindow(start, end);
    if (!win) {
      setEvMsg("⚠️ Čas má špatný formát.");
      return;
    }

    let team = null;
    let title = null;

    if (type === "match") {
      team = evTeam?.value || "A";
    } else {
      title = (evTitle?.value || "").trim();
      if (!title) {
        setEvMsg("⚠️ U turnaje vyplň název.");
        return;
      }
    }

    const eventId = makeEventId({ date, start, type, team, title });
    const ref = doc(db, "events", eventId);

    setEvMsg("⏳ Ukládám…");

    // Nechceme přepisovat existující event se stejným ID
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setEvMsg("ℹ️ Tato akce už existuje (stejné datum+čas+typ).");
      return;
    }

    await setDoc(ref, {
      date,
      start,
      end,
      blockStart: win.blockStart,
      blockEnd: win.blockEnd,
      type,
      team,
      title,
      note,
      createdAt: new Date().toISOString()
    });

    setEvMsg("✅ Uloženo.");
    await loadEvents(); // refresh list

  } catch(e){
    console.error(e);
    setEvMsg("❌ Uložení selhalo (zkontroluj Rules).");
  }
});

// =========================================================
// Načtení a vykreslení akcí
// =========================================================
async function loadEvents(){
  if (!eventsList) return;

  eventsList.innerHTML = "<p><em>Načítám…</em></p>";

  try{
    const q = query(collection(db, "events"), orderBy("date"), orderBy("start"));
    const snap = await getDocs(q);

    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!items.length) {
      eventsList.innerHTML = "<p><em>Zatím nejsou uložené žádné akce.</em></p>";
      return;
    }

    const html = items.map(ev => {
      const label = ev.type === "match" ? `Zápas ${ev.team}` : (ev.title || "Turnaj");
      return `
        <div class="rowline">
          <div>
            <strong>${ev.date}</strong> ${ev.start}–${ev.end}
            <span class="small" style="margin-left:8px; opacity:0.85;">
              (blokace: ${ev.blockStart}–${ev.blockEnd})
            </span>
            <div class="small" style="margin-top:4px;">
              <strong>${label}</strong>
              ${ev.note ? ` — ${ev.note}` : ""}
            </div>
          </div>
          <div>
            <button class="btn-danger" type="button" data-del="${ev.id}">Smazat</button>
          </div>
        </div>
      `;
    }).join("");

    eventsList.innerHTML = html;

    // Mazání akce
    eventsList.querySelectorAll("button[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        if (!id) return;
        if (!confirm("Opravdu smazat tuto akci?")) return;

        try{
          await deleteDoc(doc(db, "events", id));
          await loadEvents();
        } catch(e){
          console.error(e);
          alert("Nepodařilo se smazat akci.");
        }
      });
    });

  } catch(e){
    console.error(e);
    eventsList.innerHTML = "<p><em>Nelze načíst akce (zkontroluj Rules pro events).</em></p>";
  }
}

btnLoadEvents?.addEventListener("click", loadEvents);
