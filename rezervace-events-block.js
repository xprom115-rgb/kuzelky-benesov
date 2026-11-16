// Blokování rezervací podle akcí v kolekci events.
// Akce blokuje všechny dráhy a kontroluje celý zvolený interval.
import { db } from "./firebase-config.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
const dateInput = document.getElementById("date");
const lanesBox = document.getElementById("lanes");
const form = document.getElementById("reservation-form");
const startSelect = document.getElementById("f-start");
const endSelect = document.getElementById("f-end");
let currentDate = null, blocks = [];
const toMin = value => { const m=String(value||"").match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1])*60+Number(m[2]) : null; };
const overlaps = (a,b,c,d) => a < d && c < b;
async function load(date) {
  currentDate=date; blocks=[]; if(!date) return;
  try {
    const snap=await getDocs(query(collection(db,"events"),where("date","==",date)));
    blocks=snap.docs.map(d=>{ const e=d.data()||{}; const from=toMin(e.blockStart); const to=e.blockEnd==="00:00"?1440:toMin(e.blockEnd); return from===null||to===null?null:{from,to,label:e.type==="match"?`Zápas ${e.team||""}`.trim():(e.title||"Turnaj")}; }).filter(Boolean);
  } catch(e){ console.error("events load failed",e); }
}
function hit(start,end){ const s=toMin(start),e=toMin(end); return blocks.find(b=>overlaps(s,e,b.from,b.to))||null; }
function apply(){
  lanesBox?.querySelectorAll(".slot-btn").forEach(el=>{
    el.classList.remove("slot-blocked"); el.removeAttribute("data-block-label");
    const h=hit(el.dataset.start, `${String(Number(el.dataset.start.slice(0,2))+1).padStart(2,"0")}:00`);
    if(h){ el.classList.add("slot-blocked"); el.dataset.blockLabel=h.label; }
  });
}
dateInput?.addEventListener("change",async()=>{await load(dateInput.value);setTimeout(apply,50);});
if(lanesBox) new MutationObserver(apply).observe(lanesBox,{childList:true,subtree:true});
lanesBox?.addEventListener("click",e=>{ const el=e.target.closest?.(".slot-blocked"); if(el){e.preventDefault();e.stopPropagation();alert(`Termín je blokovaný (${el.dataset.blockLabel||"Akce"}).`);}},true);
form?.addEventListener("submit",async e=>{
  const date=dateInput?.value||""; if(currentDate!==date) await load(date);
  const h=hit(startSelect?.value,endSelect?.value);
  if(h){e.preventDefault();e.stopImmediatePropagation();alert(`Zvolený interval je blokovaný (${h.label}).`);}
},true);
if(dateInput?.value) load(dateInput.value).then(()=>setTimeout(apply,50));
