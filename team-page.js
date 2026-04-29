// =========================================================
// team-page.js (vyčištěná + okomentovaná verze)
//
// CO TO DĚLÁ:
// - A/B/C: načte JSON z ./data/teams/{A|B|C}.json a vykreslí:
//   - název týmu (#teamTitle)
//   - aktualizováno (#teamUpdated)
//   - poslední zápas (#lastMatch)
//   - následující zápas (#nextMatch)
//   - tabulka soutěže (#tableWrap)
// - DOROST: načte z Firestore team_manual/DOROST (mapa bulletins) a vykreslí
//   - tlačítka kol + odkaz na zpravodaj po kliknutí (#bulletinsWrap)
// =========================================================

import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ---------------------------------------------------------
// Parametr stránky: ?team=A|B|C|DOROST
// ---------------------------------------------------------
const params = new URLSearchParams(location.search);
const TEAM_ID = (params.get("team") || "").toUpperCase();

// ---------------------------------------------------------
// DOM prvky
// ---------------------------------------------------------
const elTitle = document.getElementById("teamTitle");
const elUpdated = document.getElementById("teamUpdated");
const elLast = document.getElementById("lastMatch");
const elNext = document.getElementById("nextMatch");
const elTable = document.getElementById("tableWrap");
const elBulletins = document.getElementById("bulletinsWrap");

// ---------------------------------------------------------
// Styling „hezčí kabát“ – injekce CSS (aby se nemusely editovat HTML/CSS soubory)
// - řádek Benešova v tabulce
// - tmavší buňky tabulky pro čitelnost přes pozadí
// - zvýraznění výsledků win/loss/draw (když ho použijeme)
// ---------------------------------------------------------
(function injectEnhancements() {
  const id = "teamPageEnhancements";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    /* Benešov v tabulce */
    .row-benesov{
      background: rgba(255, 215, 0, 0.38) !important;
      outline: 2px solid rgba(255, 215, 0, 0.65);
      box-shadow: inset 0 0 0 9999px rgba(0,0,0,0.10);
    }
    .row-benesov td{ font-weight: 800; }

    /* Čitelnost tabulky */
    .tabulka td{ background: rgba(0,0,0,0.18); }
    .tabulka tr:hover td{ background: rgba(0,0,0,0.28); }

    /* Výsledek zápasu (pokud se použije) */
    .match-win  { background: rgba(20, 120, 60, 0.55) !important; border-left: 8px solid rgba(46, 204, 113, 0.95); }
    .match-loss { background: rgba(140, 40, 30, 0.55) !important; border-left: 8px solid rgba(231, 76, 60, 0.95); }
    .match-draw { background: rgba(160, 120, 0, 0.50) !important; border-left: 8px solid rgba(241, 196, 15, 0.95); }

    /* Dorost tlačítka */
    .dorost-tabs{ display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
    .dorost-tab{ padding:8px 12px; border-radius:10px; border:0; cursor:pointer; }
    .dorost-panel{ margin-top:10px; padding:12px; border-radius:12px; background: rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); }
  `;
  document.head.appendChild(style);
})();

// ---------------------------------------------------------
// Helpery: bezpečné escapování
// ---------------------------------------------------------
function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escAttr(s) {
  return esc(s).replaceAll('"', "&quot;");
}

// ---------------------------------------------------------
// Helper: odkazy (HTML, ne markdown)
// ---------------------------------------------------------
function linkHtml(url, text) {
  if (!url) return "";
  const safe = escAttr(url);
  const label = esc(text || "Otevřít");
  return `<a class="btn-open" href="${safe}" target="_blank" rel="noopener">${label}</a>`;
}

// ---------------------------------------------------------
// Helper: domácí/venku
// ---------------------------------------------------------
function yesNoHome(v) {
  if (v === true) return "doma";
  if (v === false) return "venku";
  return "—";
}

// ---------------------------------------------------------
// Helper: výsledek z pohledu Benešova (pro zvýraznění posledního zápasu)
// - podporuje čísla i string "6:2" / "5,5:2,5"
// ---------------------------------------------------------
function parseResult(resultStr) {
  const clean = (resultStr || "").toString().trim().replace(/\s+/g, "");
  const parts = clean.split(":");
  if (parts.length !== 2) return null;
  const left = Number(parts[0].replace(",", "."));
  const right = Number(parts[1].replace(",", "."));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return { left, right };
}

function matchClassFromMatch(match) {
  // Pokud nevíme, jak to posoudit, nic nebarvíme.
  if (!match) return "";

  // Preferujeme číselná pole, pokud existují
  if (typeof match.scoreHome === "number" && typeof match.scoreAway === "number") {
    const ben = match.home === true ? match.scoreHome : (match.home === false ? match.scoreAway : null);
    const opp = match.home === true ? match.scoreAway : (match.home === false ? match.scoreHome : null);
    if (ben === null || opp === null) return "";
    if (ben > opp) return "match-win";
    if (ben < opp) return "match-loss";
    return "match-draw";
  }

  // Jinak zkusíme match.score jako "6:2"
  const rr = parseResult(match.score || "");
  if (!rr) return "";
  const ben = match.home === true ? rr.left : (match.home === false ? rr.right : null);
  const opp = match.home === true ? rr.right : (match.home === false ? rr.left : null);
  if (ben === null || opp === null) return "";
  if (ben > opp) return "match-win";
  if (ben < opp) return "match-loss";
  return "match-draw";
}

// ---------------------------------------------------------
// Vykreslení „poslední/následující zápas“
// ---------------------------------------------------------
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

  const score =
    (typeof match.scoreHome === "number" && typeof match.scoreAway === "number")
      ? `${match.scoreHome}:${match.scoreAway}`
      : (match.score ? esc(match.score) : "—");

  const pins =
    (typeof match.pinsHome === "number" && typeof match.pinsAway === "number")
      ? `${match.pinsHome}:${match.pinsAway}`
      : (match.pins ? esc(match.pins) : "");

  const link = match.matchUrl || match.url || "";

  // zvýraznění win/loss/draw (jen u posledního zápasu dává smysl, ale nevadí i u next)
  const cls = matchClassFromMatch(match);

  boxEl.innerHTML = `
    <div class="card ${cls}" style="margin:10px 0;">
      <div><strong>${date}${time}</strong> • ${esc(hv)} • ${opp}</div>
      <div style="margin-top:6px;">
        <strong>Skóre:</strong> ${score}
        ${pins ? ` • <strong>Kuželky:</strong> ${pins}` : ""}
      </div>
      ${link ? `<div style="margin-top:8px;">${linkHtml(link, "Detail zdroje")}</div>` : ""}
    </div>
  `;
}

// ---------------------------------------------------------
// Tabulka (A/B/C): columns + rows (array-of-arrays)
// - zvýrazní Benešov podle window.__teamKey (v JSON feed.source.teamKey)
// ---------------------------------------------------------
function renderTable(table) {
  if (!elTable) return;

  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    elTable.innerHTML = `<p><em>Tabulka zatím není naimportována.</em></p>`;
    return;
  }

  const cols = Array.isArray(table.columns) && table.columns.length
    ? table.columns
    : ["#", "Družstvo", "Body", "Zápasy", "Skóre", "Průměr"];

  const teamKey = (window.__teamKey || "").toLowerCase().trim();

  // index sloupce „Družstvo“
  const teamColIdx = cols.findIndex(c => (c || "").toString().trim().toLowerCase() === "družstvo");
  const isBenesov = (name) => {
    // primárně teamKey (z JSON), fallback na “benešov”
    const t = (name || "").toString().toLowerCase();
    if (teamKey && t.includes(teamKey)) return true;
    return t.includes("benešov");
  };

  const thead = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;

  const tbody = table.rows.map(r => {
    if (!Array.isArray(r)) return "";
    let rowArr = r.slice(0, cols.length);
    if (rowArr.length < cols.length) rowArr = rowArr.concat(Array(cols.length - rowArr.length).fill(""));

    const teamName = (teamColIdx >= 0) ? (rowArr[teamColIdx] || "") : "";
    const rowClass = isBenesov(teamName) ? "row-benesov" : "";

    return `<tr class="${rowClass}">${rowArr.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`;
  }).join("");

  elTable.innerHTML = `
    <table class="tabulka">
      ${thead}
      ${tbody}
    </table>
  `;
}

// ---------------------------------------------------------
// Dorost: záložky podle kol z Firestore mapy bulletins
// bulletins: { "1": {title,url}, "2": {...}, ... }
// ---------------------------------------------------------
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

  if (rounds.length === 0) {
    elBulletins.innerHTML = `<p><em>Zatím nejsou zveřejněné žádné zpravodaje.</em></p>`;
    return;
  }

  const buttons = rounds.map(r => {
    return `<button class="dorost-tab btn-soft" type="button" data-round="${r}">${r}. kolo</button>`;
  }).join("");

  elBulletins.innerHTML = `
    <div class="dorost-tabs">${buttons}</div>
    <div class="dorost-panel">
      <h4 id="dorostTabTitle" style="margin:0 0 8px 0; color:#ffd700;">Zpravodaj</h4>
      <div id="dorostTabBody"><em>Vyber kolo.</em></div>
    </div>
  `;

  function setActive(round) {
    document.querySelectorAll(".dorost-tab").forEach(btn => {
      const isActive = (btn.dataset.round === String(round));
      btn.classList.toggle("btn-primary", isActive);
      btn.classList.toggle("btn-soft", !isActive);
    });
  }

  document.querySelectorAll(".dorost-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.round;
      const it = bulletinsMap[String(r)] || {};
      const url = it.url || "";
      const title = it.title || `${r}. kolo`;

      const titleEl = document.getElementById("dorostTabTitle");
      const bodyEl = document.getElementById("dorostTabBody");

      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.innerHTML = url ? linkHtml(url, "Otevřít PDF") : `<em>Chybí URL</em>`;

      setActive(r);
    });
  });
}

// ---------------------------------------------------------
// Načti JSON pro A/B/C
// ---------------------------------------------------------
async function loadJsonTeam(teamId) {
  const res = await fetch(`./data/teams/${teamId}.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// ---------------------------------------------------------
// Render celé stránky podle feedu
// ---------------------------------------------------------
function render(feed) {
  const label = feed?.label || `Tým ${TEAM_ID}`;
  if (elTitle) elTitle.textContent = label;

  // Dorost: neukazujeme "Aktualizováno"
  if (TEAM_ID === "DOROST") {
    if (elUpdated) elUpdated.textContent = "";
  } else {
    if (elUpdated) elUpdated.textContent = feed?.updatedAt ? `Aktualizováno: ${feed.updatedAt}` : "";
  }

  // klíč pro zvýraznění Benešova v tabulce (z JSON feed.source.teamKey)
  window.__teamKey = feed?.source?.teamKey || "";

  // Dorost režim
  if (TEAM_ID === "DOROST") {
    if (elLast) elLast.style.display = "none";
    if (elNext) elNext.style.display = "none";
    if (elTable) elTable.style.display = "none";
    if (elBulletins) elBulletins.style.display = "";

    renderDorostTabs(feed?.bulletinsMap);
    return;
  }

  // A/B/C režim
  if (elLast) elLast.style.display = "";
  if (elNext) elNext.style.display = "";
  if (elTable) elTable.style.display = "";
  if (elBulletins) elBulletins.style.display = "none";

  renderMatch(elLast, feed?.lastMatch, "Poslední zápas zatím není naimportován.");
  renderMatch(elNext, feed?.nextMatch, "Následující zápas zatím není naimportován.");
  renderTable(feed?.table);
}

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
async function init() {
  if (!TEAM_ID) {
    if (elTitle) elTitle.textContent = "Chybí parametr ?team=";
    return;
  }

  // Dorost: načti z Firestore team_manual/DOROST
  if (TEAM_ID === "DOROST") {
    try {
      const ref = doc(db, "team_manual", "DOROST");
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};
      const bulletinsMap = (data.bulletins && typeof data.bulletins === "object") ? data.bulletins : {};

      render({
        label: "Dorost",
        source: { teamKey: "" },
        updatedAt: null,
        bulletinsMap
      });
    } catch (e) {
      console.error(e);
      if (elTitle) elTitle.textContent = "Chyba načítání dorost zpravodajů (Firestore).";
      if (elBulletins) elBulletins.innerHTML = `<p><em>Nelze načíst zpravodaje.</em></p>`;
    }
    return;
  }

  // A/B/C: načti JSON
  try {
    const feed = await loadJsonTeam(TEAM_ID);
    render(feed);
  } catch (e) {
    console.error(e);
    if (elTitle) elTitle.textContent = "Chyba načítání JSON (data/teams).";
  }
}

init();
