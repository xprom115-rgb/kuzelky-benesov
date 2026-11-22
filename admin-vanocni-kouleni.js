import {db,auth} from "./firebase-config.js";
import {doc,getDoc,setDoc,collection,onSnapshot,deleteDoc,serverTimestamp,writeBatch} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import {signInWithEmailAndPassword,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
const $=id=>document.getElementById(id),configRef=doc(db,"vanocni_kouleni","config");
const login=$("admin-login"),panel=$("admin-panel"),eventsEl=$("vk-events"),list=$("vk-list"),filter=$("vk-filter"),msg=$("vk-message");let reservations=[],results=[],stop=null,scoreStop=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=iso=>{if(!iso)return"";const[y,m,d]=iso.split("-");return`${d}.${m}.${y}`};
function eventRow(e={type:"pre",label:"Předehrávka",date:"",from:"16:00",to:"20:00"},removable=true){const row=document.createElement("div");row.className="event-row";row.innerHTML=`<label>Typ<select class="e-type"><option value="main" ${e.type==="main"?"selected":""}>Hlavní turnaj</option><option value="pre" ${e.type==="pre"?"selected":""}>Předehrávka</option></select></label><label>Popisek<input class="e-label" value="${esc(e.label)}"></label><label>Datum<input class="e-date" type="date" value="${esc(e.date)}"></label><label>Čas od–do<div><input class="e-from" type="time" value="${esc(e.from)}"> <input class="e-to" type="time" value="${esc(e.to)}"></div></label>${removable?'<button class="btn danger remove" type="button">Odebrat</button>':'<span></span>'}`;row.querySelector(".remove")?.addEventListener("click",()=>row.remove());eventsEl.appendChild(row);}
function readEvents(){return[...eventsEl.querySelectorAll(".event-row")].map(r=>({type:r.querySelector(".e-type").value,label:r.querySelector(".e-label").value.trim(),date:r.querySelector(".e-date").value,from:r.querySelector(".e-from").value,to:r.querySelector(".e-to").value})).filter(e=>e.date&&e.from&&e.to);}
async function loadConfig(){const snap=await getDoc(configRef),c=snap.exists()?snap.data():{};$("vk-title").value=c.title||"Vánoční koulení";$("vk-pdf").value=c.invitationPdf||"";$("vk-published").checked=!!c.published;$("vk-open").checked=!!c.registrationOpen;eventsEl.innerHTML="";(c.events?.length?c.events:[{type:"main",label:"Hlavní turnaj",date:"",from:"09:00",to:"18:00"}]).forEach((e,i)=>eventRow(e,i>0));renderFilter(c.events||[]);}
function renderFilter(events){filter.innerHTML='<option value="">Všechny termíny</option>'+events.map(e=>`<option value="${e.type}-${e.date}">${esc(e.label)} – ${fmt(e.date)}</option>`).join("");renderList();}
function renderList(){const f=filter.value,rows=(f?reservations.filter(r=>r.data.eventId===f):reservations).sort((a,b)=>`${a.data.date}${a.data.start}${a.data.lane}`.localeCompare(`${b.data.date}${b.data.start}${b.data.lane}`));list.innerHTML=rows.length?rows.map(r=>`<div class="admin-reservation-row"><div><strong>${fmt(r.data.date)} ${esc(r.data.start)}</strong> – dráha ${r.data.lane} – ${esc(r.data.blocked?"BLOKOVÁNO":r.data.name)}${r.data.blocked?"":` <span class="small">(${`${r.data.playerType==="registered"?"registrovaný":"neregistrovaný"}, ${r.data.gender==="women"?"ženy":"muži"}`})</span>`}</div><button class="btn danger" data-del="${r.id}">Smazat hráče i výsledek</button></div>`).join(""):"<p><em>Žádné registrace.</em></p>";list.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>removeReservation(b.dataset.del));}
const scoreType=$("score-player-type"),scoreGender=$("score-gender"),scorePlayer=$("score-player"),scoreMsg=$("score-message"),scorePrint=$("score-results-print");
function scoreTitle(type,gender){return `${type==="registered"?"Registrovaní":"Neregistrovaní"} – ${gender==="men"?"muži":"ženy"}`;}
function resultMap(){return new Map(results.map(r=>[r.id,r.data]));}
function renderScorePlayers(){
  if(!scorePlayer)return;
  const done=resultMap(),type=scoreType.value,gender=scoreGender.value;
  const pending=reservations.filter(r=>!r.data.blocked&&r.data.playerType===type&&r.data.gender===gender&&!done.has(r.id)).sort((a,b)=>a.data.name.localeCompare(b.data.name,"cs"));
  scorePlayer.innerHTML=pending.length?pending.map(r=>`<option value="${r.id}">${esc(r.data.name)} – ${fmt(r.data.date)} ${esc(r.data.start)}, dráha ${r.data.lane}</option>`).join(""):"<option value=\"\">V této kategorii není nikdo bez výsledku</option>";
  $("score-pending").innerHTML=`<p class="small">Čeká na výsledek: <strong>${pending.length}</strong></p>`;
}
function sortedResults(type,gender){return results.map(r=>({id:r.id,...r.data})).filter(r=>r.playerType===type&&r.gender===gender).sort((a,b)=>b.pins-a.pins||a.zeros-b.zeros||b.hundreds-a.hundreds||a.name.localeCompare(b.name,"cs"));}
function renderScoreResults(){
  if(!scorePrint)return;
  const groups=[["registered","men"],["registered","women"],["unregistered","men"],["unregistered","women"]];
  scorePrint.innerHTML=`<h1>Vánoční koulení – výsledková listina</h1>`+groups.map(([type,gender])=>{const rows=sortedResults(type,gender);return `<section class="score-group"><h3>${scoreTitle(type,gender)}</h3>${rows.length?`<table class="score-table"><thead><tr><th>Poř.</th><th>Jméno</th><th>Kuželky</th><th>Nuly</th><th>Hodovky</th><th class="screen-only">Akce</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.pins}</td><td>${r.zeros}</td><td>${r.hundreds}</td><td class="screen-only"><button type="button" class="btn danger" data-score-del="${r.id}">Smazat výsledek</button></td></tr>`).join("")}</tbody></table>`:"<p><em>Zatím bez výsledků.</em></p>"}</section>`;}).join("");
  scorePrint.querySelectorAll("[data-score-del]").forEach(b=>b.onclick=async()=>{if(confirm("Smazat výsledek a vrátit hráče mezi čekající?"))await deleteDoc(doc(db,"vanocni_kouleni_results",b.dataset.scoreDel));});
}
async function saveScore(){
  const reservationId=scorePlayer.value,r=reservations.find(x=>x.id===reservationId)?.data;
  const pins=Number($("score-pins").value),zeros=Number($("score-zeros").value),hundreds=Number($("score-hundreds").value);
  if(!r)return scoreMsg.textContent="Vyberte hráče bez výsledku.";
  if(!Number.isInteger(pins)||pins<0||!Number.isInteger(zeros)||zeros<0||!Number.isInteger(hundreds)||hundreds<0)return scoreMsg.textContent="Všechny tři výsledky musí být celá nezáporná čísla.";
  await setDoc(doc(db,"vanocni_kouleni_results",reservationId),{reservationId,name:r.name,playerType:r.playerType,gender:r.gender,pins,zeros,hundreds,updatedAt:serverTimestamp()},{merge:false});
  $("score-pins").value="";$("score-zeros").value="";$("score-hundreds").value="";scoreMsg.textContent=`Výsledek hráče ${r.name} byl uložen.`;
}
function startScores(){scoreStop?.();scoreStop=onSnapshot(collection(db,"vanocni_kouleni_results"),snap=>{results=snap.docs.map(d=>({id:d.id,data:d.data()}));renderScorePlayers();renderScoreResults();},e=>{scoreMsg.textContent=`Výsledky nelze načíst: ${e.message}`;});}

async function removeReservation(id){if(!confirm("Opravdu smazat hráče, jeho rezervaci i případný výsledek?"))return;const r=reservations.find(x=>x.id===id)?.data;const batch=writeBatch(db);batch.delete(doc(db,"vanocni_kouleni_reservations",id));
  batch.delete(doc(db,"vanocni_kouleni_results",id));
  if(r?.name){const key=r.name.trim().toLocaleLowerCase("cs").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");batch.delete(doc(db,"vanocni_kouleni_names",key));}
  await batch.commit();}
async function save(){const events=readEvents();if(!events.length)return msg.textContent="Zadejte alespoň jeden termín.";await setDoc(configRef,{title:$("vk-title").value.trim()||"Vánoční koulení",invitationPdf:$("vk-pdf").value.trim(),published:$("vk-published").checked,registrationOpen:$("vk-open").checked,events,updatedAt:serverTimestamp()},{merge:false});msg.textContent="Nastavení bylo uloženo.";renderFilter(events);}
function start(){stop?.();stop=onSnapshot(collection(db,"vanocni_kouleni_reservations"),snap=>{reservations=snap.docs.map(d=>({id:d.id,data:d.data()}));renderList();renderScorePlayers();});}
$("vk-add-pre").onclick=()=>eventRow();$("vk-save").onclick=save;$("vk-refresh").onclick=loadConfig;filter.onchange=renderList;$("admin-login-btn").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("admin-email").value.trim(),$("admin-pass").value);}catch(e){$("admin-login-msg").textContent="Nesprávný e-mail nebo heslo.";}};$("admin-logout-btn").onclick=()=>signOut(auth);
scoreType?.addEventListener("change",renderScorePlayers);scoreGender?.addEventListener("change",renderScorePlayers);$("score-save")?.addEventListener("click",saveScore);$("score-print")?.addEventListener("click",()=>window.print());
onAuthStateChanged(auth,user=>{login.hidden=!!user;panel.hidden=!user;if(user){loadConfig();start();startScores();}else{stop?.();scoreStop?.();}});
