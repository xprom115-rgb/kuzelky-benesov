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
      ${link ? `<div style="margin-top:8px;"><a href="${esc(link)}" target="_blank" rel="noopener">Detail zdroje</a></div>` : ""}
    </div>
  `;
}

function renderTable(table) {
  if (!elTable) return;

  // Prázdná / chybějící tabulka
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    elTable.innerHTML = `<p><em>Tabulka zatím není naimportována.</em></p>`;
    return;
  }

  // Sloupce – vezmi z JSON, jinak fallback
  const cols = Array.isArray(table.columns) && table.columns.length
    ? table.columns
    : ["#","Družstvo","Body","Zápasy","Skóre","Průměr"];

  // teamKey pro zvýraznění Benešova (nastavuje se v init())
  const teamKey = (window.__teamKey || "").toLowerCase().trim();

  const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;

  const body = table.rows.map(r => {
    // 1) Preferovaný formát: array-of-arrays (nejstabilnější)
    if (Array.isArray(r)) {
      // srovnat délku řádku na počet sloupců
      let rowArr = r.slice(0, cols.length);
      if (rowArr.length < cols.length) {
        rowArr = rowArr.concat(Array(cols.length - rowArr.length).fill(""));
      }

      const rowText = rowArr.join(" ").toLowerCase();
      const isBenesov = teamKey && rowText.includes(teamKey);

      return `<tr class="${isBenesov ? "is-benesov" : ""}">
        ${rowArr.map(x => `<td>${esc(x)}</td>`).join("")}
      </tr>`;
    }

    // 2) Fallback: array-of-maps (kdyby někdy rows byly objekty)
    if (r && typeof r === "object") {
      const values = cols.map(colName => r[colName] ?? r[colName.toLowerCase()] ?? "");
      const rowText = values.join(" ").toLowerCase();
      const isBenesov = teamKey && rowText.includes(teamKey);



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

  if (elUpdated) elUpdated.textContent = feed?.updatedAt ? `Aktualizováno: ${feed.updatedAt}` : "";

  const srcType = feed?.source?.type;
  const isDorost = (srcType === "skks" || TEAM_ID === "DOROST");

  if (isDorost){
    if (elLast) elLast.style.display = "none";
    if (elNext) elNext.style.display = "none";
    if (elTable) elTable.style.display = "none";
    if (elBulletins) elBulletins.style.display = "";

    renderBulletins(feed?.bulletins);
    return;
  }

  if (elLast) elLast.style.display = "";
  if (elNext) elNext.style.display = "";
  if (elTable) elTable.style.display = "";
  if (elBulletins) elBulletins.style.display = "none";

  renderMatch(elLast, feed?.lastMatch, "Poslední zápas zatím není naimportován.");
  renderMatch(elNext, feed?.nextMatch, "Následující zápas zatím není naimportován.");
  renderTable(feed?.table);
}

async function init(){
  if (!TEAM_ID){
    if (elTitle) elTitle.textContent = "Chybí parametr ?team=";
    return;
  }

  try {
    const res = await fetch(`./data/teams/${TEAM_ID}.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const feed = await res.json();
window.__teamKey = feed?.source?.teamKey || "";
    render(feed);
  } catch (e) {
    console.error(e);
    if (elTitle) elTitle.textContent = "Chyba načítání JSON (data/teams).";
  }
}

init();
``
