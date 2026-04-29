import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

/* =========================================================
   DOM
   ========================================================= */
const titleEl = document.getElementById("histTitle");
const subEl = document.getElementById("histSubtitle");
const seasonsWrap = document.getElementById("seasonsWrap");
const detailEl = document.getElementById("seasonDetail");

/* =========================================================
   Konstanty / popisky
   ========================================================= */
const TEAM_NAMES = {
  A: "TJ Sokol Benešov A",
  B: "TJ Sokol Benešov B",
  C: "TJ Sokol Benešov C",
  DOROST: "Dorost"
};

/* =========================================================
   Helpery: escape + datum
   ========================================================= */
function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escAttr(s) {
  // pro atribut href apod. (minimálně escap uvozovek)
  return esc(s).replaceAll('"', "&quot;");
}

function getTeamId() {
  const p = new URLSearchParams(location.search);
  const t = (p.get("team") || "").toUpperCase();
  return ["A", "B", "C", "DOROST"].includes(t) ? t : null;
}

function fmtDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
}

/* =========================================================
   Tabulka snapshot + zvýraznění Benešova
   - zvýrazní řádek, kde je v názvu "Benešov"
   ========================================================= */
function renderTable(finalTable) {
  if (!finalTable || !Array.isArray(finalTable.columns) || !Array.isArray(finalTable.rows)) {
    return `<p><em>Tabulka pro tuto sezónu není uložená.</em></p>`;
  }

  const cols = finalTable.columns;

  // index sloupce "Družstvo"
  const teamColIdx = cols.findIndex(c => (c || "").toString().trim().toLowerCase() === "družstvo");
  const isBenesovTeam = (s) => /benešov/i.test((s || "").toString());

  // rows: array-of-objects {c0,c1,...} -> array-of-arrays
  const rows = finalTable.rows.map(obj =>
    cols.map((_, i) => (obj?.["c" + i] ?? "").toString())
  );

  const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;

  const body = rows.map(r => {
    const teamName = (teamColIdx >= 0) ? (r[teamColIdx] || "") : "";
    const rowClass = isBenesovTeam(teamName) ? "row-benesov" : "";
    return `<tr class="${rowClass}">${r.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`;
  }).join("");

  return `<table class="tabulka">${head}${body}</table>`;
}

/* =========================================================
   Načtení sezón + výpis dlaždic
   ========================================================= */
async function loadSeasons(teamId) {
  const colRef = collection(db, "team_history", teamId, "seasons");
  const snap = await getDocs(colRef);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.id || "").localeCompare(a.id || ""));
}

function renderSeasons(teamId, seasons) {
  if (!seasonsWrap) return;

  if (!seasons.length) {
    seasonsWrap.innerHTML = `<p><em>Zatím není uložená žádná sezóna.</em></p>`;
    return;
  }

  seasonsWrap.innerHTML = seasons.map(s => {
    const sid = s.seasonId || s.id;
    return `
      <div class="hist-tile">
        <div>
          <h3>${esc(sid)}</h3>
          <div class="desc">Klikni na Otevřít pro zobrazení obsahu sezóny.</div>
        </div>
        <button class="btn-primary" type="button" data-season="${escAttr(s.id)}">Otevřít</button>
      </div>
    `;
  }).join("");

  seasonsWrap.querySelectorAll("button[data-season]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const seasonId = btn.getAttribute("data-season");
      await showSeasonDetail(teamId, seasonId);
    });
  });
}

/* =========================================================
   Zápasy snapshot (pastList) -> tabulka + zvýraznění výsledku Benešova
   ========================================================= */
function parseResultSide(resultStr) {
  const clean = (resultStr || "").toString().trim().replace(/\s+/g, "");
  const parts = clean.split(":");
  if (parts.length !== 2) return null;

  const left = Number(parts[0].replace(",", "."));
  const right = Number(parts[1].replace(",", "."));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  return { left, right };
}

function isBenesovTeamName(s) {
  return /benešov/i.test((s || "").toString());
}

function matchRowClass(m) {
  const homeIsBen = isBenesovTeamName(m.home);
  const awayIsBen = isBenesovTeamName(m.away);
  if (!homeIsBen && !awayIsBen) return "";

  const rr = parseResultSide(m.result);
  if (!rr) return "";

  const ben = homeIsBen ? rr.left : rr.right;
  const opp = homeIsBen ? rr.right : rr.left;

  // 0:0 bereme jako remízu / bez rozhodnutí
  if (ben > opp) return "match-win";
  if (ben < opp) return "match-loss";
  return "match-draw";
}

function renderMatchesTable(pastList) {
  if (!pastList || !pastList.length) {
    return `<p><em>V této sezóně nejsou uložené žádné zápasy.</em></p>`;
  }

  const rows = pastList
    .slice()
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
    .map(m => {
      const cls = matchRowClass(m);
      return `
        <tr class="${cls}">
          <td><strong>${esc(m.round ?? "")}.</strong></td>
          <td>${esc(fmtDate(m.date ?? ""))}</td>
          <td>${esc(m.home ?? "")}</td>
          <td>${esc(m.away ?? "")}</td>
          <td><strong>${esc(m.result ?? "")}</strong></td>
          <td>${esc(m.pins ?? "")}</td>
        </tr>
      `;
    }).join("");

  return `
    <table class="tabulka matches-table">
      <tr>
        <th>Kolo</th>
        <th>Datum</th>
        <th>Domácí</th>
        <th>Hosté</th>
        <th>Výsledek</th>
        <th>Kuželky</th>
      </tr>
      ${rows}
    </table>
  `;
}

/* =========================================================
   Detail sezóny (po kliknutí "Otevřít")
   ========================================================= */
async function showSeasonDetail(teamId, seasonId) {
  if (!detailEl) return;
  detailEl.innerHTML = `<p><em>Načítám sezónu…</em></p>`;

  const ref = doc(db, "team_history", teamId, "seasons", seasonId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    detailEl.innerHTML = `<p><em>Sezóna nenalezena.</em></p>`;
    return;
  }

  const data = snap.data() || {};

  // -------------------------
  // Dorost: souhrnný zpravodaj (bez ternárního template => žádné rozhození závorek)
  // -------------------------
  if (teamId === "DOROST") {
    const url = data?.summaryBulletin?.url || "";
    const label = data?.summaryBulletin?.title || "Souhrnný zpravodaj (8. kolo)";

    let html = `<h3 style="margin-top:0; color:#ffd700;">Sezóna ${esc(seasonId)}</h3>`;

    if (url) {
      html += `<a class="btn-open" href="${escAttr(url)}" target="_blank" rel="noopener">Otevřít: ${esc(label)}</a>`;
    } else {
      html += `<p><em>Souhrnný zpravodaj není uložen.</em></p>`;
    }

    detailEl.innerHTML = html;
    return;
  }

  // -------------------------
  // A/B/C: tabulka + zápasy
  // -------------------------
  const tableHtml = renderTable(data.finalTable);
  const pastList = Array.isArray(data.pastList) ? data.pastList : [];

  detailEl.innerHTML = `
    <h3 style="margin-top:0; color:#ffd700;">Sezóna ${esc(seasonId)}</h3>

    <h4 style="margin:10px 0 6px 0; color:#ffd700;">Tabulka (uložený snapshot)</h4>
    ${tableHtml}

    <h4 style="margin:14px 0 6px 0; color:#ffd700;">Zápasy (uložený snapshot)</h4>
    ${renderMatchesTable(pastList)}
  `;
}

/* =========================================================
   Init
   ========================================================= */
async function init() {
  const teamId = getTeamId();
  if (!teamId) {
    if (titleEl) titleEl.textContent = "Historie – neznámý tým";
    if (subEl) subEl.textContent = "Chybí parametr ?team=A|B|C|DOROST";
    if (seasonsWrap) seasonsWrap.innerHTML = `<p><em>Nelze načíst sezóny.</em></p>`;
    return;
  }

  const name = TEAM_NAMES[teamId] || teamId;
  if (titleEl) titleEl.textContent = `Historie – ${name}`;
  if (subEl) subEl.textContent = "Vyber sezónu a klikni na Otevřít.";

  // detail se nezobrazuje automaticky
  if (detailEl) detailEl.innerHTML = "";

  try {
    const seasons = await loadSeasons(teamId);
    renderSeasons(teamId, seasons);
  } catch (e) {
    console.error(e);
    if (seasonsWrap) seasonsWrap.innerHTML = `<p><em>Nelze načíst sezóny (zkontroluj Firestore Rules pro team_history).</em></p>`;
  }
}

init();
