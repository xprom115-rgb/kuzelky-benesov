import { db } from "./firebase-config.js";
import { doc, onSnapshot, collection, query, where, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const CONFIG_REF=doc(db,"vanocni_kouleni","config");
const eventSelect=document.getElementById("vk-event"),schedule=document.getElementById("vk-schedule"),status=document.getElementById("vk-status"),modal=document.getElementById("vk-modal");
const nameInput=document.getElementById("vk-name"),playerTypeInput=document.getElementById("vk-player-type"),genderInput=document.getElementById("vk-gender");
const modalInfo=document.getElementById("vk-modal-info"),reserveBtn=document.getElementById("vk-reserve"),closeBtn=document.getElementById("vk-close");
let config=null,reservations=new Map(),stopReservations=null,selected=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=v=>String(v||"").trim().replace(/\s+/g," ");
const slug=v=>clean(v).toLocaleLowerCase("cs").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const fmtDate=iso=>{if(!iso)return"";const[y,m,d]=iso.split("-");return`${d}.${m}.${y}`;};
const mins=t=>{const[h,m]=t.split(":").map(Number);return h*60+m;};
const fmtTime=m=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const makeSlots=(from,to)=>{const out=[];for(let m=mins(from);m+30<=mins(to);m+=30)out.push(fmtTime(m));return out;};
const eventId=e=>`${e.type}-${e.date}`;
const slotId=(e,lane,start)=>`${eventId(e)}_${start.replace(":","")}_d${lane}`;
function setStatus(text,error=false){status.textContent=text||"";status.className=error?"vk-error":"";}

function renderEvents(){const events=(config?.events||[]).filter(e=>e.date&&e.from&&e.to);eventSelect.innerHTML=events.map((e,i)=>`<option value="${i}">${esc(e.label||`${e.type==="main"?"Turnaj":"Předehrávka"} ${fmtDate(e.date)}`)}</option>`).join("");if(events.length){subscribe(events[0]);renderSchedule(events[0]);}else schedule.innerHTML="<p><em>Termíny zatím nebyly zveřejněny.</em></p>";}
function subscribe(event){stopReservations?.();reservations.clear();stopReservations=onSnapshot(query(collection(db,"vanocni_kouleni_reservations"),where("eventId","==",eventId(event))),snap=>{reservations=new Map(snap.docs.map(d=>[d.id,d.data()]));renderSchedule(event);},e=>setStatus(`Rezervace nelze načíst: ${e.message}`,true));}
function renderSchedule(event){const starts=makeSlots(event.from,event.to);schedule.innerHTML=`<h2>${esc(event.label||"Vánoční koulení")}</h2><p><strong>${fmtDate(event.date)}</strong>, ${esc(event.from)}–${esc(event.to)}</p>`+[1,2,3,4].map(lane=>`<section class="vk-lane"><h3>Dráha ${lane}</h3><div class="vk-slots">${starts.map(start=>{const id=slotId(event,lane,start),r=reservations.get(id);return`<button type="button" class="vk-slot ${r?"full":"free"}" data-slot="${id}" data-lane="${lane}" data-time="${start}" ${r?"disabled":""}>${r?esc(r.name||"Obsazeno"):start}</button>`;}).join("")}</div></section>`).join("");schedule.querySelectorAll(".vk-slot.free").forEach(btn=>btn.onclick=()=>openModal(event,btn));}
function openModal(event,btn){selected={event,lane:Number(btn.dataset.lane),start:btn.dataset.time,id:btn.dataset.slot};nameInput.value="";playerTypeInput.value="registered";genderInput.value="men";modalInfo.textContent=`${fmtDate(event.date)}, ${btn.dataset.time}, dráha ${btn.dataset.lane}`;modal.hidden=false;nameInput.focus();}
function closeModal(){modal.hidden=true;selected=null;}
async function reserve(){
  const name=clean(nameInput.value),playerType=String(playerTypeInput.value),gender=String(genderInput.value);
  if(name.length<3||name.length>80)return setStatus("Zadejte celé jméno v délce 3 až 80 znaků.",true);
  if(!["registered","unregistered"].includes(playerType))return setStatus("Vyberte typ hráče.",true);
  if(!["men","women"].includes(gender))return setStatus("Vyberte kategorii.",true);
  if(!selected)return;
  reserveBtn.disabled=true;setStatus("Ukládám rezervaci…");
  const lockRef=doc(db,"vanocni_kouleni_names",slug(name)),slotRef=doc(db,"vanocni_kouleni_reservations",selected.id);
  try{
    await runTransaction(db,async tx=>{
      const slotSnap=await tx.get(slotRef),nameSnap=await tx.get(lockRef);
      if(slotSnap.exists())throw new Error("Tento termín už byl obsazen.");
      if(nameSnap.exists())throw new Error("Toto jméno už má jednu rezervaci.");
      tx.set(slotRef,{eventId:eventId(selected.event),eventType:selected.event.type,date:selected.event.date,start:selected.start,lane:selected.lane,name,playerType,gender,blocked:false,createdAt:serverTimestamp()});
      tx.set(lockRef,{name,reservationId:selected.id,createdAt:serverTimestamp()});
    });
    closeModal();setStatus(`Rezervace byla uložena: ${name}, ${playerType==="registered"?"registrovaný":"neregistrovaný"}, ${gender==="women"?"ženy":"muži"}.`);
  }catch(e){setStatus(e.message||"Rezervaci se nepodařilo uložit.",true);}finally{reserveBtn.disabled=false;}
}

eventSelect.addEventListener("change",()=>{const e=config.events[Number(eventSelect.value)];subscribe(e);renderSchedule(e);});
reserveBtn.addEventListener("click",reserve);closeBtn.addEventListener("click",closeModal);modal.addEventListener("click",e=>{if(e.target===modal)closeModal();});nameInput.addEventListener("keydown",e=>{if(e.key==="Enter")reserve();});
onSnapshot(CONFIG_REF,snap=>{config=snap.exists()?snap.data():null;if(!config?.registrationOpen){schedule.innerHTML="<p><strong>Registrace nyní není otevřena.</strong></p>";eventSelect.innerHTML="";return;}renderEvents();},e=>setStatus(`Nastavení nelze načíst: ${e.message}`,true));
