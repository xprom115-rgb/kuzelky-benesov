const params = new URLSearchParams(location.search);
const TEAM_ID = params.get("team"); // "A" | "B" | "C" | "DOROST"

const elTitle = document.getElementById("teamTitle");
const elUpdated = document.getElementById("teamUpdated");
const elLast = document.getElementById("lastMatch");
const elNext = document.getElementById("nextMatch");
const elTable = document.getElementById("tableWrap");
const elBulletins = document.getElementById("bulletinsWrap");

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function yesNoHome(v) {
  if (v === true) return "doma";
  if (v === false) return "venku";
  return "—";
}

function renderMatch(boxEl, match, emptyText) {
  if (!boxEl) return;

  if (!match) {
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

function renderBulletins(bulletins) {
  if (!elBulletins) return;

  if (!Array.isArray(bulletins) || bulletins.length === 0) {
    elBulletins.innerHTML = `<p><em>Zatím nejsou zveřejněné žádné zpravodaje.</em></p>`;
    return;
  }

  elBulletins.innerHTML = `
    <ul>
      ${bulletins.map(b => {
        const title = esc(b.title || "Zpravodaj");
        const url = esc(b.url || "");
        const date = b.date ? ` (${esc(b.date)})` : "";
