import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const LANES=[1,2,3,4], START=8*60, END=21*60;
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const toTime=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const toMin=t=>{const m=String(t||"").match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60 + +m[2]:null;};
const times=(includeEnd=false)=>{const a=[];for(let m=START;m<(includeEnd?END+1:END);m+=60)a.push(toTime(m));return a;};
const lanesOf=r=>(Array.isArray(r.lanes)?r.lanes:[r.lane]).map(Number).filter(n=>LANES.includes(n));
const overlap=(a,b,c,d)=>a<d&&c<b;
function code(){const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",v=new Uint32Array(6);crypto.getRandomValues(v);return [...v].map(n=>c[n%c.length]).join("");}
async function rowsFor(date){const s=await getDocs(query(collection(db,"reservations"),where("date","==",date)));return s.docs.map(d=>d.data());}
function conflicts(rows,lanes,start,end){const a=toMin(start),b=toMin(end);return lanes.filter(l=>rows.some(r=>lanesOf(r).includes(l)&&overlap(a,b,toMin(r.start),toMin(r.end))));}
function fill(el,arr,value){el.innerHTML=arr.map(x=>`<option value="${x}"${x===value?" selected":""}>${x}</option>`).join("");}

const modal=$("res-form"), startEl=$("f-start"), endEl=$("f-end");
const laneEls=[...document.querySelectorAll(".f-lane")], allEl=$("f-all-lanes");
let selectedDate="";
function refreshEnds(){const arr=times(true).filter(t=>toMin(t)>toMin(startEl.value));fill(endEl,arr,arr.includes(endEl.value)?endEl.value:arr[0]);}
function syncAll(){if(!allEl)return;allEl.checked=laneEls.length>0&&laneEls.every(x=>x.checked);allEl.indeterminate=laneEls.some(x=>x.checked)&&!allEl.checked;}
function openForm(date,lane,start){
 selectedDate=date;
 if(!modal||!startEl||!endEl||!laneEls.length){alert("Rezervační formulář není kompletní. Nahrajte současně nové soubory rezervace.html a rezervace.js.");return;}
 $("f-name").value=""; $("f-note").value="";
 laneEls.forEach(x=>x.checked=Number(x.value)===lane);syncAll();
 fill(startEl,times(false),start);refreshEnds();
 modal.hidden=false;modal.style.display="grid";
}
function closeForm(){if(modal){modal.hidden=true;modal.style.display="none";}}
function result(r){
 $("reservation-summary").textContent=`Dráhy ${r.lanes.join(", ")} • ${r.date} • ${r.start}–${r.end}`;
 $("code").innerHTML=`<span class="reservation-code">${r.id}</span><button id="btnCopyCode" class="btn-soft" type="button">Kopírovat</button>`;
 $("btnCopyCode").onclick=()=>navigator.clipboard.writeText(r.id).then(()=>alert("Kód zkopírován.")).catch(()=>alert("Kód si zkopírujte ručně."));
 const url=`${BASE_URL}rezervace-storno.html`,q=$("qrcode");q.innerHTML="";
 try{q.innerHTML=new window.QRCode({content:url,width:200,height:200,padding:1}).svg();}catch{q.textContent=url;}
 $("reservation-result").style.display="block";
}
let renderId=0;
async function render(date){
 const id=++renderId,box=$("lanes");box.innerHTML="";if(!date)return;
 const rows=await rowsFor(date);if(id!==renderId)return;box.innerHTML="";
 for(const lane of LANES){const wrap=document.createElement("div");wrap.className="lane-box";wrap.innerHTML=`<h3>Dráha ${lane}</h3>`;
  for(const start of times(false)){const busy=conflicts(rows,[lane],start,toTime(toMin(start)+60)).length>0,b=document.createElement("button");b.type="button";b.className=`slot-btn ${busy?"busy":"free"}`;b.disabled=busy;b.textContent=start;b.dataset.lane=lane;b.dataset.start=start;wrap.appendChild(b);}box.appendChild(wrap);}
}
$("lanes")?.addEventListener("click",e=>{const b=e.target.closest?.(".slot-btn");if(!b||b.disabled||b.classList.contains("slot-blocked"))return;openForm($("date").value,Number(b.dataset.lane),b.dataset.start);});
allEl?.addEventListener("change",()=>laneEls.forEach(x=>x.checked=allEl.checked));laneEls.forEach(x=>x.addEventListener("change",syncAll));
startEl?.addEventListener("change",refreshEnds);$("f-cancel")?.addEventListener("click",closeForm);$("date")?.addEventListener("change",e=>render(e.target.value));
$("reservation-form")?.addEventListener("submit",async e=>{e.preventDefault();const name=$("f-name").value.trim(),note=$("f-note").value.trim(),lanes=laneEls.filter(x=>x.checked).map(x=>Number(x.value)),start=startEl.value,end=endEl.value;
 if(name.length<2)return alert("Zadejte prosím jméno.");if(!lanes.length)return alert("Vyberte alespoň jednu dráhu.");if(toMin(start)<START||toMin(end)>END||toMin(end)<=toMin(start))return alert("Čas musí být v rozsahu 08:00–21:00.");
 const rows=await rowsFor(selectedDate),bad=conflicts(rows,lanes,start,end);if(bad.length)return alert(`Obsazené dráhy: ${bad.join(", ")}.`);
 try{const r={id:code(),date:selectedDate,lanes,lane:lanes[0],start,end,name,note,createdAt:Timestamp.now()};await addDoc(collection(db,"reservations"),r);closeForm();result(r);await render(selectedDate);}catch(err){console.error(err);alert("Rezervaci se nepodařilo uložit.");}
});
window.addEventListener("load",()=>{const d=$("date"),now=new Date(),local=new Date(now-now.getTimezoneOffset()*60000).toISOString().slice(0,10);d.min=local;if(d.value)render(d.value);});
