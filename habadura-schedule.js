import { db } from "./firebase-config.js";
import { doc, setDoc, onSnapshot, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const COLLECTION="habaduraSchedules", LEAGUE=1, TIMES=["17:30","19:00","20:30"], LANES=4, ALLOWED="Benešov D";
const box=document.querySelector(".schedule-box"), title=box?.querySelector("h3"), tbody=box?.querySelector("tbody");
const editor=document.getElementById("scheduleEditorBenesovD"), roundSel=document.getElementById("schedule-round-select");
const countInput=document.getElementById("schedule-match-count"), rowsEl=document.getElementById("schedule-editor-rows");
const saveBtn=document.getElementById("schedule-save-button"), pdfBtn=document.getElementById("schedule-pdf-button"), msg=document.getElementById("schedule-editor-message");
let loggedTeam=window.__habaduraLoggedTeam||null, activeRound=2, draft=null, unsubscribe=null, teams=[];

const canEdit=t=>String(t?.name||"").trim().localeCompare(ALLOWED,"cs",{sensitivity:"base"})===0;
const ref=r=>doc(db,COLLECTION,`liga-${LEAGUE}-kolo-${r}`);
const message=(text,error=false)=>{if(msg){msg.textContent=text;msg.style.color=error?"#ffb3b3":"#fff";}};
const emptyMatch=n=>({number:n,date:"",times:[...TIMES],slots:TIMES.map(()=>Array(LANES).fill(""))});

function normalize(data,round=activeRound){
  const count=Math.max(1,Number(data?.matchCount||data?.matches?.length||5));
  return {league:LEAGUE,round:Number(round),matchCount:count,matches:Array.from({length:count},(_,i)=>{
    const m=data?.matches?.[i]||{}, flat=Array.isArray(m.slotsFlat)?m.slotsFlat:null;
    return {number:Number(m.number)||i+1,date:String(m.date||""),times:TIMES.map((t,x)=>String(m.times?.[x]||t)),
      slots:TIMES.map((_,ti)=>Array.from({length:LANES},(_,li)=>String(flat?.[ti*LANES+li]??m.slots?.[ti]?.[li]??"")))};
  })};
}

function initial(){
  const rs=[...(tbody?.rows||[])], matches=[];
  for(let i=0;i<rs.length;i+=3){const g=rs.slice(i,i+3);if(!g.length)continue;const c=g[0].cells;
    const slots=g.map((r,ri)=>{const cells=[...r.cells],off=ri===0?3:1;return Array.from({length:LANES},(_,l)=>{const v=cells[off+l]?.textContent.trim()||"";return v==="-"?"":v;});});
    matches.push({number:Number(c[0]?.textContent.trim())||matches.length+1,date:c[1]?.textContent.trim()||"",times:[...TIMES],slots});}
  return normalize({matchCount:matches.length||5,matches},1);
}
const initialData=initial();

function formatDate(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||""));return m?`${m[3]}.${m[2]}.${m[1]}`:String(v||"");}
function renderPublic(data){const s=normalize(data,activeRound);if(title)title.textContent=`Rozpis zápasů - 1. liga - ${s.round}. kolo`;if(!tbody)return;tbody.innerHTML="";
  s.matches.forEach(match=>match.times.forEach((time,ti)=>{const tr=document.createElement("tr");if(ti===0){const n=document.createElement("td");n.rowSpan=3;n.textContent=match.number;tr.appendChild(n);const d=document.createElement("td");d.rowSpan=3;d.textContent=formatDate(match.date);tr.appendChild(d);}const tc=document.createElement("td");tc.textContent=time;tr.appendChild(tc);for(let l=0;l<LANES;l++){const td=document.createElement("td");td.textContent=match.slots[ti][l]||"";tr.appendChild(td);}tbody.appendChild(tr);}));}

async function loadTeams(){try{const snap=await getDocs(collection(db,"teams")),map=new Map();snap.docs.map(d=>d.data()).filter(t=>[1,2].includes(Number(t.liga))&&typeof t.name==="string").forEach(t=>{const name=t.name.trim(),liga=Number(t.liga);if(name)map.set(`${liga}|${name}`,{name,liga});});teams=[...map.values()].sort((a,b)=>a.liga-b.liga||a.name.localeCompare(b.name,"cs"));if(draft&&canEdit(loggedTeam))renderEditor();}catch(e){message(`Seznam týmů nelze načíst: ${e.code||e.message}`,true);}}
function teamSelect(value,ti,li){const s=document.createElement("select");s.dataset.time=ti;s.dataset.lane=li;const empty=document.createElement("option");empty.value="";empty.textContent="— volné / rezerva —";s.appendChild(empty);const groups=new Map();teams.forEach(t=>{if(!groups.has(t.liga)){const g=document.createElement("optgroup");g.label=`${t.liga}. liga`;groups.set(t.liga,g);s.appendChild(g);}const o=document.createElement("option");o.value=t.name;o.textContent=t.name;groups.get(t.liga).appendChild(o);});if(value&&!teams.some(t=>t.name===value)){const o=document.createElement("option");o.value=value;o.textContent=`${value} (dříve uložený tým)`;s.appendChild(o);}s.value=value||"";return s;}

function readEditor(){if(!draft||!rowsEl)return;draft.matches=[...rowsEl.querySelectorAll(".schedule-edit-match")].map((b,i)=>({number:Number(b.querySelector(".schedule-number")?.value)||i+1,date:b.querySelector(".schedule-date")?.value||"",times:TIMES.map((t,x)=>b.querySelector(`[data-time-value="${x}"]`)?.value||t),slots:TIMES.map((_,ti)=>Array.from({length:LANES},(_,li)=>b.querySelector(`[data-time="${ti}"][data-lane="${li}"]`)?.value.trim()||""))}));draft.matchCount=draft.matches.length;}
function renderEditor(){if(!rowsEl||!draft)return;rowsEl.innerHTML="";draft.matches.forEach((m,i)=>{const block=document.createElement("div");block.className="schedule-edit-match";const head=document.createElement("div");head.className="schedule-edit-heading";head.innerHTML=`<label><strong>Zápas č.</strong> <input class="schedule-number" type="number" min="1" value="${m.number||i+1}"></label><label>Datum <input class="schedule-date" type="date" value="${m.date||""}"></label>`;block.appendChild(head);const table=document.createElement("table");table.className="schedule-editor-table";table.innerHTML="<thead><tr><th>Čas</th><th>Dráha 1</th><th>Dráha 2</th><th>Dráha 3</th><th>Dráha 4</th></tr></thead>";const tb=document.createElement("tbody");m.times.forEach((time,ti)=>{const tr=document.createElement("tr");tr.innerHTML=`<td><input class="schedule-time" type="time" data-time-value="${ti}" value="${time}"></td>`;for(let l=0;l<LANES;l++){const td=document.createElement("td");td.appendChild(teamSelect(m.slots[ti][l]||"",ti,l));tr.appendChild(td);}tb.appendChild(tr);});table.appendChild(tb);block.appendChild(table);rowsEl.appendChild(block);});if(countInput)countInput.value=draft.matchCount;}
function resize(n){readEditor();n=Math.max(1,Math.min(30,Number(n)||1));while(draft.matches.length<n)draft.matches.push(emptyMatch(draft.matches.length+1));draft.matches=draft.matches.slice(0,n);draft.matchCount=n;renderEditor();}
function loadRound(r){activeRound=Number(r);unsubscribe?.();unsubscribe=onSnapshot(ref(activeRound),snap=>{draft=normalize(snap.exists()?snap.data():(activeRound===1?initialData:{}),activeRound);renderPublic(draft);if(canEdit(loggedTeam))renderEditor();},e=>message(`Rozpis nelze načíst: ${e.code||e.message}`,true));}

roundSel?.addEventListener("change",()=>loadRound(roundSel.value));
window.addEventListener("habadura-active-round-changed", event => {
  const nextRound = Number(event.detail?.round || 1);
  if (![1,2,3].includes(nextRound)) return;
  if (roundSel) roundSel.value = String(nextRound);
  loadRound(nextRound);
});
countInput?.addEventListener("change",()=>resize(countInput.value));
saveBtn?.addEventListener("click",async()=>{if(!canEdit(loggedTeam))return message("Rozpis může upravovat pouze tým Benešov D.",true);readEditor();saveBtn.disabled=true;message("Ukládám…");try{
  // Firestore nepodporuje pole uvnitř pole. 3x4 mřížku proto ukládáme jako jediné ploché pole slotsFlat.
  const payload={...draft,matches:draft.matches.map(m=>({number:m.number,date:m.date,times:m.times,slotsFlat:m.slots.flat()})),updatedAt:serverTimestamp(),updatedByTeamId:loggedTeam.id||"",updatedByTeamName:loggedTeam.name||""};
  await setDoc(ref(activeRound),payload,{merge:false});message("Rozpis byl uložen. Prázdná místa zůstala jako rezervy.");
}catch(e){console.error(e);message(`Uložení selhalo: ${e.code||"neznámá-chyba"} – ${e.message||"bez popisu"}`,true);}finally{saveBtn.disabled=false;}});
pdfBtn?.addEventListener("click",()=>{if(!canEdit(loggedTeam))return message("PDF může vytvořit pouze přihlášený tým Benešov D.",true);readEditor();renderPublic(draft);document.body.classList.add("print-schedule-only");window.print();setTimeout(()=>document.body.classList.remove("print-schedule-only"),500);});
window.addEventListener("afterprint",()=>document.body.classList.remove("print-schedule-only"));window.addEventListener("habadura-team-changed",e=>{loggedTeam=e.detail?.team||null;if(editor)editor.hidden=!canEdit(loggedTeam);if(canEdit(loggedTeam)&&draft)renderEditor();});
if(editor)editor.hidden=!canEdit(loggedTeam);
const initialActiveRound = Number(window.__habaduraActiveRound || activeRound);
activeRound = [1,2,3].includes(initialActiveRound) ? initialActiveRound : 1;
if (roundSel) roundSel.value = String(activeRound);
loadTeams();
loadRound(activeRound);
