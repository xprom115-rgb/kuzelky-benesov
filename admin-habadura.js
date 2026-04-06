import { app, db } from "./firebase-config.js";

import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } 
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import {
  collection, getDocs, onSnapshot, query, where,
  updateDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const auth = getAuth(app);

// DOM
const loginBox = document.getElementById("loginBox");
const appBox = document.getElementById("appBox");
const editBox = document.getElementById("editBox");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginMsg = document.getElementById("loginMsg");

const ligaEl = document.getElementById("liga");
const filterDateEl = document.getElementById("filterDate");
const clearFilter = document.getElementById("clearFilter");
const matchesList = document.getElementById("matchesList");

const editDate = document.getElementById("editDate");
const editHomeTeam = document.getElementById("editHomeTeam");
const editAwayTeam = document.getElementById("editAwayTeam");
const editHomePlayers = document.getElementById("editHomePlayers");
const editAwayPlayers = document.getElementById("editAwayPlayers");

const sumHomeEl = document.getElementById("sumHome");
const sumAwayEl = document.getElementById("sumAway");
const bodyHomeEl = document.getElementById("bodyHome");
const bodyAwayEl = document.getElementById("bodyAway");

const btnCloseEdit = document.getElementById("btnCloseEdit");
const btnSaveEdit = document.getElementById("btnSaveEdit");
const btnDeleteMatch = document.getElementById("btnDeleteMatch");
const editMsg = document.getElementById("editMsg");

let teams = [];
let players = [];
let currentDocId = null;
let currentMatch = null;
let unsubscribe = null;

// helpers
const csCompare = (a,b)=> (a||"").localeCompare(b||"","cs");
const sum = arr => arr.reduce((a,b)=>a+b,0);

function computeBonus(sumHome, sumAway){
  // +2 za více kuželek, remíza 1:1
  if (sumHome > sumAway) return { bonusHome:2, bonusAway:0 };
  if (sumHome < sumAway) return { bonusHome:0, bonusAway:2 };
  return { bonusHome:1, bonusAway:1 };
}

async function loadBase(){
  const ts = await getDocs(collection(db,"teams"));
  teams = ts.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>csCompare(a.name,b.name));

  const ps = await getDocs(collection(db,"players"));
  players = ps.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>csCompare(a.name,b.name));
}

function fillTeamSelects(liga){
  const ligaTeams = teams.filter(t=>Number(t.liga)===Number(liga));
  editHomeTeam.innerHTML = "";
  editAwayTeam.innerHTML = "";
  ligaTeams.forEach(t=>{
    const o1=document.createElement("option"); o1.value=t.id; o1.textContent=t.name;
    const o2=document.createElement("option"); o2.value=t.id; o2.textContent=t.name;
    editHomeTeam.appendChild(o1); editAwayTeam.appendChild(o2);
  });
}

function playersOfTeam(teamId){
  return players.filter(p=>p.teamId===teamId).sort((a,b)=>csCompare(a.name,b.name));
}

function mkPlayerRow(side, idx){
  const row = document.createElement("div");
  row.className = "toolrow";
  row.innerHTML = `
    <label class="small">Hráč ${idx+1}:</label>
    <select class="${side}-pl"></select>
    <input type="number" class="${side}-kuz" placeholder="Kuželky" style="max-width:120px;">
    <input type="number" class="${side}-bod" placeholder="Body (0/1/2)" style="max-width:120px;">
  `;
  return row;
}

function fillPlayerRows(){
  // naplní selecty hráčů podle zvolených týmů
  const hp = playersOfTeam(editHomeTeam.value);
  const ap = playersOfTeam(editAwayTeam.value);

  document.querySelectorAll(".home-pl").forEach(sel=>{
    sel.innerHTML = "";
    hp.forEach(p=>{ const o=document.createElement("option"); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
  });
  document.querySelectorAll(".away-pl").forEach(sel=>{
    sel.innerHTML = "";
    ap.forEach(p=>{ const o=document.createElement("option"); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
  });
}

function recompute(){
  const hk = [...document.querySelectorAll(".home-kuz")].map(x=>Number(x.value)||0);
  const hb = [...document.querySelectorAll(".home-bod")].map(x=>Number(x.value)||0);
  const ak = [...document.querySelectorAll(".away-kuz")].map(x=>Number(x.value)||0);
  const ab = [...document.querySelectorAll(".away-bod")].map(x=>Number(x.value)||0);

  const sumHome = sum(hk);
  const sumAway = sum(ak);

  const baseBodyHome = sum(hb);
  const baseBodyAway = sum(ab);

  const { bonusHome, bonusAway } = computeBonus(sumHome, sumAway);
  const totalBodyHome = baseBodyHome + bonusHome;
  const totalBodyAway = baseBodyAway + bonusAway;

  sumHomeEl.textContent = sumHome;
  sumAwayEl.textContent = sumAway;
  bodyHomeEl.textContent = totalBodyHome;
  bodyAwayEl.textContent = totalBodyAway;

  return { sumHome, sumAway, totalBodyHome, totalBodyAway, bonusHome, bonusAway };
}

function openEdit(docId, match, liga){
  currentDocId = docId;
  currentMatch = match;
  editMsg.textContent = "";

  editBox.style.display = "block";

  fillTeamSelects(liga);

  editDate.value = match.date || "";

  editHomeTeam.value = match.homeTeam;
  editAwayTeam.value = match.awayTeam;

  // vytvoř 3+3 řádky
  editHomePlayers.innerHTML = "";
  editAwayPlayers.innerHTML = "";
  for (let i=0;i<3;i++){
    editHomePlayers.appendChild(mkPlayerRow("home", i));
    editAwayPlayers.appendChild(mkPlayerRow("away", i));
  }

  fillPlayerRows();

  // doplň hodnoty
  (match.homePlayers||[]).forEach((p,i)=>{
    const sel = document.querySelectorAll(".home-pl")[i];
    const kuz = document.querySelectorAll(".home-kuz")[i];
    const bod = document.querySelectorAll(".home-bod")[i];
    if (sel) sel.value = p.playerId;
    if (kuz) kuz.value = p.kuzelky ?? "";
    if (bod) bod.value = p.body ?? "";
  });

  (match.awayPlayers||[]).forEach((p,i)=>{
    const sel = document.querySelectorAll(".away-pl")[i];
    const kuz = document.querySelectorAll(".away-kuz")[i];
    const bod = document.querySelectorAll(".away-bod")[i];
    if (sel) sel.value = p.playerId;
    if (kuz) kuz.value = p.kuzelky ?? "";
    if (bod) bod.value = p.body ?? "";
  });

  recompute();

  // listeners pro přepočet
  [...document.querySelectorAll(".home-kuz,.home-bod,.away-kuz,.away-bod")]
    .forEach(inp=>inp.addEventListener("input", recompute));

  editHomeTeam.onchange = () => { fillPlayerRows(); };
  editAwayTeam.onchange = () => { fillPlayerRows(); };
}

function renderMatches(list){
  if (!list.length){
    matchesList.innerHTML = "<p><em>Žádné zápasy.</em></p>";
    return;
  }

  matchesList.innerHTML = list.map(x=>{
    const m = x.data;
    const home = teams.find(t=>t.id===m.homeTeam)?.name || "(tým?)";
    const away = teams.find(t=>t.id===m.awayTeam)?.name || "(tým?)";
    return `
      <div class="listrow">
        <div>
          <strong>${m.date || ""}</strong> — ${home} vs ${away}
          <span class="small"> | Body ${m.bodyHome}:${m.bodyAway} | Kuželky ${m.sumHome}:${m.sumAway}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-primary" data-edit="${x.docId}">Upravit</button>
        </div>
      </div>
    `;
  }).join("");

  matchesList.querySelectorAll("button[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.edit;
      const found = list.find(x=>x.docId===id);
      if (found) openEdit(id, found.data, Number(ligaEl.value));
    });
  });
}

function listenMatches(){
  if (unsubscribe) unsubscribe();

  const liga = Number(ligaEl.value);
  const q = query(collection(db,"matches"), where("liga","==", liga));

  unsubscribe = onSnapshot(q, snap=>{
    let list = snap.docs.map(d=>({docId:d.id, data:d.data()}));

    const fd = filterDateEl.value;
    if (fd) list = list.filter(x=>x.data.date === fd);

    list.sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||""));
    renderMatches(list);
  });
}

// Auth UI
btnLogin.addEventListener("click", async ()=>{
  loginMsg.textContent = "";
  try{
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  }catch(e){
    console.error(e);
    loginMsg.textContent = "Nepodařilo se přihlásit (zkontroluj email/heslo).";
  }
});

btnLogout.addEventListener("click", ()=> signOut(auth));

onAuthStateChanged(auth, async (user)=>{
  if (user){
    loginBox.style.display = "none";
    appBox.style.display = "block";
    await loadBase();
    listenMatches();
  } else {
    loginBox.style.display = "block";
    appBox.style.display = "none";
    editBox.style.display = "none";
    currentDocId = null;
    currentMatch = null;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  }
});

ligaEl.addEventListener("change", ()=>{
  editBox.style.display="none";
  currentDocId=null;
  listenMatches();
});

clearFilter.addEventListener("click", ()=>{
  filterDateEl.value = "";
  listenMatches();
});
filterDateEl.addEventListener("change", listenMatches);

btnCloseEdit.addEventListener("click", ()=>{
  editBox.style.display="none";
  currentDocId=null;
});

btnSaveEdit.addEventListener("click", async ()=>{
  if (!currentDocId) return;

  const liga = Number(ligaEl.value);

  const homePlayers = [...document.querySelectorAll(".home-pl")].map((sel,i)=>({
    playerId: sel.value,
    kuzelky: Number(document.querySelectorAll(".home-kuz")[i].value)||0,
    body: Number(document.querySelectorAll(".home-bod")[i].value)||0
  }));

  const awayPlayers = [...document.querySelectorAll(".away-pl")].map((sel,i)=>({
    playerId: sel.value,
    kuzelky: Number(document.querySelectorAll(".away-kuz")[i].value)||0,
    body: Number(document.querySelectorAll(".away-bod")[i].value)||0
  }));

  // validace bodů
  for (const p of [...homePlayers, ...awayPlayers]){
    if (!p.playerId){ editMsg.textContent="Vyber hráče ve všech řádcích."; return; }
    if (![0,1,2].includes(p.body)){ editMsg.textContent="Body musí být 0/1/2."; return; }
    if (p.kuzelky < 0){ editMsg.textContent="Kuželky musí být kladné."; return; }
  }

  const { sumHome, sumAway, totalBodyHome, totalBodyAway, bonusHome, bonusAway } = recompute();

  try{
    await updateDoc(doc(db,"matches", currentDocId), {
      liga,
      date: editDate.value,
      homeTeam: editHomeTeam.value,
      awayTeam: editAwayTeam.value,
      homePlayers,
      awayPlayers,
      sumHome,
      sumAway,
      bodyHome: totalBodyHome,
      bodyAway: totalBodyAway,
      bonusHome,
      bonusAway
    });

    editMsg.textContent = "✅ Uloženo.";
  }catch(e){
    console.error(e);
    editMsg.textContent = "❌ Uložení selhalo (zkontroluj Rules/UID admina).";
  }
});

btnDeleteMatch.addEventListener("click", async ()=>{
  if (!currentDocId) return;
  if (!confirm("Opravdu smazat zápas?")) return;

  try{
    await deleteDoc(doc(db,"matches", currentDocId));
    editBox.style.display="none";
    currentDocId=null;
  }catch(e){
    console.error(e);
    editMsg.textContent = "❌ Smazání selhalo (zkontroluj Rules/UID admina).";
  }
});
