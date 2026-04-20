import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

/**
 * Tabulka (A/B/C) – dynamicky podle columns a rows (array-of-arrays).
 * Zvýrazní Benešov přes window.__teamKey.
 */
function renderTable(table) {
  if (!elTable) return;

  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    elTable.innerHTML = `<p><em>Tabulka zatím není naimportována.</em></p>`;
    return;
  }

  const cols = Array.isArray(table.columns) && table.columns.length
    ? table.columns
    : ["#","Družstvo","Body","Zápasy","Skóre","Průměr"];

  const teamKey = (window.__teamKey || "").toLowerCase().trim();

  const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;

  const body = table.rows.map(r => {
    if (!Array.isArray(r)) return "";
    let rowArr = r.slice(0, cols.length);
    if (rowArr.length < cols.length) rowArr = rowArr.concat(Array(cols.length - rowArr.length).fill(""));

    const rowText = rowArr.join(" ").toLowerCase();
    const isBenesov = teamKey && rowText.includes(teamKey);

    return `<tr class="${isBenesov ? "is-benesov" : ""}">
      ${rowArr.map(x => `<td>${esc(x)}</td>`).join("")}
    </tr>`;
  }).join("");

  elTable.innerHTML = `<table class="tabulka">${head}${body}</table>`;
}

/**
 * ✅ Dorost záložky 1–8 z Firestore mapy bulletins:
 * bulletins: { "1": {title,url}, "2": {title,url}, ... }
 */
function renderDorostTabs(bulletinsMap) {
  if (!elBulletins) return;

  if (!bulletinsMap || typeof bulletinsMap !== "object" || Object.keys(bulletinsMap).length === 0) {
    elBulletins.innerHTML = `<p><em>Zatím nejsou zveřejněné žádné zpravodaje.</em></p>`;
    return;
  }

  const rounds = Object.keys(bulletinsMap)
    .filter(k => /^\d+$/.test(k))
    .map(k => Number(k))
    .sort((a, b) => a - b);

  // vytvoř tlačítka záložek
  const tabButtons = rounds.map(r => {
    return `<button type="button" class="btn-soft dorost-tab" data-round="${r}">${r}. kolo</button>`;
  }).join("");

  // výchozí obsah = první kolo
  const first = rounds[0];
  const firstItem = bulletinsMap[String(first)] || {};
  const firstUrl = firstItem.url || "";
  const firstTitle = firstItem.title || `${first}. kolo`;

  elBulletins.innerHTML = `
    <div class="toolrow" style="gap:8px;">
      ${tabButtons}
    </div>
    <div class="card" style="margin-top:10px;">
      <h4 style="margin:0 0 6px 0; color:#ffd700;" id="dorostTabTitle">${esc(firstTitle)}</h4>
      <div id="dorostTabBody">
        ${firstUrl ? `<a href="${esc(firstUrl)}" target="_blank" rel="noopener">Otevřít PDF</a>` : `<em>Chybí URL</em>`}
      </div>
    </div>
  `;

  // aktivní styl tlačítka
  function setActive(round) {
    document.querySelectorAll(".dorost-tab").forEach(btn => {
      btn.style.opacity = (btn.dataset.round === String(round)) ? "1" : "0.7";
    });
  }
  setActive(first);

  // klikání na záložky
  document.querySelectorAll(".dorost-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.round;
      const it = bulletinsMap[String(r)] || {};
      const url = it.url || "";
      const title = it.title || `${r}. kolo`;

      const titleEl = document.getElementById("dorostTabTitle");
      const bodyEl = document.getElementById("dorostTabBody");

      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.innerHTML = url
        ? `<a href="${esc(url)}" target="_blank" rel="noopener">Otevřít PDF</a>`
        : `<em>Chybí URL</em>`;

      setActive(r);
    });
  });
}

async function loadJsonTeam(teamId) {
  const res = await fetch(`./data/teams/${teamId}.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function render(feed) {
  const label = feed?.label || `Tým ${TEAM_ID}`;
  if (elTitle) elTitle.textContent = label;

  if (elUpdated) elUpdated.textContent = feed?.updatedAt ? `Aktualizováno: ${feed.updatedAt}` : "";

  // teamKey pro zvýraznění Benešova v tabulce
  window.__teamKey = feed?.source?.teamKey || "";

  const isDorost = (TEAM_ID === "DOROST");

  if (isDorost) {
    if (elLast) elLast.style.display = "none";
    if (elNext) elNext.style.display = "none";
    if (elTable) elTable.style.display = "none";
    if (elBulletins) elBulletins.style.display = "";

    // feed dorostu očekává { bulletinsMap }
    renderDorostTabs(feed?.bulletinsMap);
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

async function init() {
  if (!TEAM_ID) {
    if (elTitle) elTitle.textContent = "Chybí parametr ?team=";
    return;
  }

  // ✅ Dorost: načti z Firestore team_manual/DOROST
  if (TEAM_ID === "DOROST") {
    try {
      const ref = doc(db, "team_manual", "DOROST");
      const snap = await getDoc(ref);

      // když dokument neexistuje nebo je prázdný, zobraz prázdno
      const data = snap.exists() ? snap.data() : {};
      const bulletinsMap = (data.bulletins && typeof data.bulletins === "object") ? data.bulletins : {};

      render({
        label: "Dorost",
        updatedAt: data.updatedAt || null,
        bulletinsMap
      });
    } catch (e) {
      console.error(e);
      if (elTitle) elTitle.textContent = "Chyba načítání dorost zpravodajů (Firestore).";
      if (elBulletins) elBulletins.innerHTML = `<p><em>Nelze načíst zpravodaje.</em></p>`;
    }
    return;
  }

  // A/B/C: zůstává JSON
  try {
    const feed = await loadJsonTeam(TEAM_ID);
    render(feed);
  } catch (e) {
    console.error(e);
    if (elTitle) elTitle.textContent = "Chyba načítání JSON (data/teams).";
  }
}

init();
