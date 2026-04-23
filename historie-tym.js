import { db } from "./firebase-config.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const titleEl = document.getElementById("histTitle");
const subEl = document.getElementById("histSubtitle");
const seasonsWrap = document.getElementById("seasonsWrap");
const detailEl = document.getElementById("seasonDetail");

const TEAM_NAMES = {
  A: "TJ Sokol Benešov A",
  B: "TJ Sokol Benešov B",
  C: "TJ Sokol Benešov C",
  DOROST: "Dorost"
};

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getTeamId() {
  const p = new URLSearchParams(location.search);
  const t = (p.get("team") || "").toUpperCase();
  if (["A","B","C","DOROST"].includes(t)) return t;
  return null;
}

function renderTable(finalTable) {
  if (!finalTable || !Array.isArray(finalTable.columns) || !Array.isArray(finalTable.rows)) {
    return `<p><em>Tabulka pro tuto sezónu není uložená.</em></p>`;
  }

  const cols = finalTable.columns;
  // rows jsou uložené jako array-of-objects {c0,c1,...}
  const rows = finalTable.rows.map(obj => cols.map((_, i) => (obj?.["c"+i] ?? "").toString()));

  const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("");

  return `<table class="tabulka">${head}${body}</table>`;
}

async function loadSeasons(teamId) {
  const colRef = collection(db, "team_history", teamId, "seasons");
  const snap = await getDocs(colRef);
  const seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (b.id||"").localeCompare(a.id||""));
  return seasons;
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
          <div class="desc">Klikni pro zobrazení obsahu sezóny.</div>
        </div>
        <button class="btn-primary" type="button" data-season="${esc(s.id)}">Otevřít</button>
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

async function showSeasonDetail(teamId, seasonId) {
  if (!detailEl) return;
  detailEl.innerHTML = `<p><em>Načítám sezónu…</em></p>`;

  const ref = doc(db, "team_history", teamId, "seasons", seasonId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    detailEl.innerHTML = `<p><em>Sezóna nenalezena.</em></p>`;
    return;
  }

  const data = snap.data();

  // Dorost: souhrnný zpravodaj (8. kolo)
  if (teamId === "DOROST") {
    const url = data?.summaryBulletin?.url || "";
    const label = data?.summaryBulletin?.title || "Souhrnný zpravodaj (8. kolo)";

    detailEl.innerHTML = `
      <h3 style="margin-top:0; color:#ffd700;">Sezóna ${esc(seasonId)}</h3>
      ${url ? `<a class="btn-primary" href="${esc(url)}" target="_blank" rel="noopener">Otevřít: ${esc(label)}</a>`
            : `<p><em>Souhrnný zpravodaj není uložen.</em></p>`}
    `;
    return;
  }

  // A/B/C: tabulka snapshot
  const tableHtml = renderTable(data?.finalTable);

  detailEl.innerHTML = `
    <h3 style="margin-top:0; color:#ffd700;">Sezóna ${esc(seasonId)}</h3>
    <h4 style="margin:10px 0 6px 0; color:#ffd700;">Tabulka (uložený snapshot)</h4>
    ${tableHtml}
  `;
}

async function init() {
  const teamId = getTeamId();
  if (!teamId) {
    if (titleEl) titleEl.textContent = "Historie – neznámý tým";
    if (subEl) subEl.textContent = "Chybí parametr ?team=A|B|C|DOROST";
    return;
  }

  const name = TEAM_NAMES[teamId] || teamId;
  if (titleEl) titleEl.textContent = `Historie – ${name}`;
  if (subEl) subEl.textContent = "Vyber sezónu.";

  try {
    const seasons = await loadSeasons(teamId);
    renderSeasons(teamId, seasons);

    // Volitelně: když existuje sezóna, zobraz první automaticky
    if (seasons.length) {
      await showSeasonDetail(teamId, seasons[0].id);
    }
  } catch (e) {
    console.error(e);
    seasonsWrap.innerHTML = `<p><em>Nelze načíst sezóny (zkontroluj Firestore Rules pro team_history).</em></p>`;
  }
}

init();
``
