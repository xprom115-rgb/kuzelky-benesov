import { db } from "./firebase-config.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
const host=document.getElementById("vanocni-kouleni-widget");
if(host)onSnapshot(doc(db,"vanocni_kouleni","config"),snap=>{const c=snap.exists()?snap.data():null;if(!c?.published){host.hidden=true;return;}host.hidden=false;host.innerHTML=`<section class="vk-widget"><h2>${escapeHtml(c.title||"Vánoční koulení")}</h2>${c.invitationPdf?`<a class="vk-pdf" href="${safePath(c.invitationPdf)}" target="_blank" rel="noopener">Otevřít pozvánku v PDF</a>`:""}${c.registrationOpen?`<a class="vk-register" href="vanocni-kouleni.html">Přejít na registraci</a>`:""}</section>`;});
function escapeHtml(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function safePath(v){const s=String(v||"").trim();return /^(\.\/|\/|[a-zA-Z0-9_-])[^<>"']*\.pdf(?:\?.*)?$/i.test(s)?s:"#";}
