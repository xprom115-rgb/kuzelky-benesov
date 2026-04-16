import { db } from "./firebase-config.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const TEAM_ID = params.get("team"); // "A" | "B" | "C" | "DOROST"

const elTitle = document.getElementById("teamTitle");
const elUpdated = document.getElementById("teamUpdated");
const elLast = document.getElementById("lastMatch");
const elNext = document.getElementById("nextMatch");
const elTable = document.getElementById("tableWrap");
const elBulletins = document.getElementById("bulletinsWrap");

function esc(s){ return (s ?? "").toString()
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

function yesNoHome(v){
  if (v === true) return "doma";
  if (v === false) return "venku";
  return "—";
}

function renderMatch(boxEl, match, emptyText){
  if (!boxEl) return;

  if (!match){
    boxEl.innerHTML = `<p><em>${esc(emptyText)}</em></p>`;
    return;
  }

  const date = match.date ? esc(match.date) : "—";
  const time = match.time ? ` ${esc(match.time)}` : "";
  const hv = yesNoHome(match.home);
  const opp = match.opponent ? esc(match.opponent) : "—";

  const score = (typeof match.scoreHome === "number" && typeof match.scoreAway === "number")
    ? `${match.scoreHome} : ${match.scoreAway}`
    : (match.score ? esc(match.score) : "—");

  const pins = (typeof match.pinsHome === "number" && typeof match.pinsAway === "number")
    ? `${match.pinsHome} : ${match.pinsAway}`
    : (match.pins ? esc(match.pins) : "");

  const link = match.matchUrl || match.url;

  boxEl.innerHTML = `
    <div class="feed-card">
      <div><strong>${date}${time}</strong> • ${hv} • ${opp}</div>
      <div style="margin-top:6px;">
        <span style="font-weight:bold;">Skóre:</span> ${score}
        ${pins ? ` • <span style="font-weight:bold;">Kuželky:</span> ${pins}` : ""}
      </div>
      ${link ? `<div style="margin-top:8px;"><a class="btn-link" href="${esc(link)}" target="_blank" rel="noopener">Detail zdroje</a></div>` : ""}
    </div>
  `;
}

function renderTable(table){
  if (!elTable) return;

  if (!table || !Array.isArray(table.rows) || table.rows.length === 0){
    elTable.innerHTML = `<p><em>Tabulka zatím není naimportována.</em></p>`;
    return;
  }

  const cols = Array.isArray(table.columns) && table.columns.length
    ? table.columns
    : ["Poř","Družstvo","Body","Z","Skóre","Průměr"];

  // rows doporučujeme jako array of maps (pos/team/points/played/score/avg),
  // ale zvládneme i array of arrays, kdyby později vzniklo jinak.
  const rows = table.rows;

  const head = `<tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr>`;

  const body = rows.map(r=>{
    if (Array.isArray(r)){
      return `<tr>${r.map(x=>`<td>${esc(x)}</td>`).join("")}</tr>`;
    }
    // map
    const tds = [
      r.pos, r.team, r.points, r.played, r.score, r.avg
    ].map(x=>`<td>${esc(x)}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  elTable.innerHTML = `<table class="tabulka">${head}${body}</table>`;
}

function renderBulletins(bulletins){
  if (!elBulletins) return;

  if (!Array.isArray(bulletins) || bulletins.length === 0){
    elBulletins.innerHTML = `<p><em>Zatím nejsou zveřejněné žádné zpravodaje.</em></p>`;
    return;
  }

  elBulletins.innerHTML = `
    <ul>
      ${bulletins.map(b => {
        const title = esc(b.title || "Zpravodaj");
        const url = esc(b.url || "");
        const date = b.date ? ` (${esc(b.date)})` : "";
        return `<li><a href="${url}" target="_blank" rel="noopener">${title}${date}</a></li>`;
      }).join("")}
    </ul>
  `;
}

function render(feed){
  const label = feed?.label || `Tým ${TEAM_ID}`;
  if (elTitle) elTitle.textContent = label;

  const up = feed?.updatedAt?.toDate ? feed.updatedAt.toDate().toLocaleString("cs-CZ") : "";
  if (elUpdated) elUpdated.textContent = up ? `Aktualizováno: ${up}` : "";

  // Dorost: jen zpravodaje
  const srcType = feed?.source?.type;
  if (srcType === "skks" || TEAM_ID === "DOROST"){
    if (elLast) elLast.style.display = "none";
    if (elNext) elNext.style.display = "none";
    if (elTable) elTable.style.display = "none";
    if (elBulletins) elBulletins.style.display = "";

    renderBulletins(feed?.bulletins);
    return;
  }

  // A/B/C: zápasy Benešova + celá tabulka
  if (elLast) elLast.style.display = "";
  if (elNext) elNext.style.display = "";
  if (elTable) elTable.style.display = "";
  if (elBulletins) elBulletins.style.display = "none";

  renderMatch(elLast, feed?.lastMatch, "Poslední zápas zatím není naimportován.");
  renderMatch(elNext, feed?.nextMatch, "Následující zápas zatím není naimportován.");
  renderTable(feed?.table);
}

function init(){
  if (!TEAM_ID){
    if (elTitle) elTitle.textContent = "Chybí parametr ?team=";
    return;
  }

  const ref = doc(db, "team_feeds", TEAM_ID);
  onSnapshot(ref, (snap)=>{
    if (!snap.exists()){
      render(null);
      return;
    }
    render(snap.data());
  }, (err)=>{
    console.error(err);
    if (elTitle) elTitle.textContent = "Chyba načítání dat (team_feeds).";
  });
}

init();
