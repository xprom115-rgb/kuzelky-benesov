// Admin rezervací – podporuje staré pole lane i nové pole lanes.
import { db, auth } from "./firebase-config.js";
import { collection, onSnapshot, deleteDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
const $=id=>document.getElementById(id);
const loginBox=$("admin-login"),panelBox=$("admin-panel"),emailInput=$("admin-email"),passInput=$("admin-pass"),loginBtn=$("admin-login-btn"),loginMsg=$("admin-login-msg"),logoutBtn=$("admin-logout-btn"),listEl=$("admin-list"),filterDate=$("filter-date"),filterClear=$("filter-clear"),cleanupBtn=$("cleanup-old");
let unsubscribe=null,allRows=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lanes=r=>(Array.isArray(r.lanes)?r.lanes:[r.lane]).map(Number).filter(n=>n>=1&&n<=4).join(", ");
const formatDate=iso=>{if(!iso||iso.length<10)return iso||"";const[y,m,d]=iso.split("-");return `${d}.${m}.${y}`;};
const todayIso=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
function show(on){loginBox.style.display=on?"none":"";panelBox.style.display=on?"block":"none";}
function stop(){if(unsubscribe){unsubscribe();unsubscribe=null;}}
function render(){
 const fd=filterDate?.value||"";
 const rows=(fd?allRows.filter(x=>x.data.date===fd):allRows.slice()).sort((a,b)=>`${a.data.date} ${a.data.start} ${lanes(a.data)}`.localeCompare(`${b.data.date} ${b.data.start} ${lanes(b.data)}`));
 if(!rows.length){listEl.innerHTML="<p><em>Žádné rezervace.</em></p>";return;}
 listEl.innerHTML=rows.map(({docId,data:r})=>`<div class="admin-reservation-row"><div><strong>${esc(formatDate(r.date))}</strong> — Dráhy <strong>${esc(lanes(r))}</strong> — <strong>${esc(r.start)}–${esc(r.end)}</strong> — ${esc(r.name)} <span class="small">(kód: ${esc(r.id)})</span>${r.note?`<br><span class="small">Poznámka: ${esc(r.note)}</span>`:""}</div><button data-del="${esc(docId)}" class="btn-danger" type="button">Smazat</button></div>`).join("");
 listEl.querySelectorAll("[data-del]").forEach(btn=>btn.onclick=async()=>{if(confirm("Opravdu chcete rezervaci smazat?"))try{await deleteDoc(doc(db,"reservations",btn.dataset.del));}catch(e){console.error(e);alert("Nepodařilo se smazat rezervaci.");}});
}
function start(){stop();unsubscribe=onSnapshot(collection(db,"reservations"),snap=>{allRows=snap.docs.map(d=>({docId:d.id,data:d.data()}));render();},e=>{console.error(e);listEl.innerHTML="<p><strong>Chyba načítání rezervací.</strong></p>";});}
async function cleanup(){const today=todayIso();const rows=allRows.filter(x=>x.data.date&&x.data.date<today);if(!rows.length)return alert("Žádné staré rezervace k mazání.");if(!confirm(`Smazat všechny rezervace před ${today}?`))return;try{for(let i=0;i<rows.length;i+=450){const batch=writeBatch(db);rows.slice(i,i+450).forEach(x=>batch.delete(doc(db,"reservations",x.docId)));await batch.commit();}alert(`Smazáno rezervací: ${rows.length}`);}catch(e){console.error(e);alert("Mazání se nepodařilo.");}}
filterDate?.addEventListener("change",render);filterClear?.addEventListener("click",()=>{filterDate.value="";render();});cleanupBtn?.addEventListener("click",cleanup);
loginBtn?.addEventListener("click",async()=>{loginMsg.textContent="";try{await signInWithEmailAndPassword(auth,emailInput.value.trim(),passInput.value);}catch(e){console.error(e);loginMsg.textContent="Nesprávný email nebo heslo.";}});logoutBtn?.addEventListener("click",()=>signOut(auth));
show(false);onAuthStateChanged(auth,user=>{show(!!user);if(user)start();else{stop();allRows=[];listEl.innerHTML="<p><em>Žádné rezervace.</em></p>";}});
