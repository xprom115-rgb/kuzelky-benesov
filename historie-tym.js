import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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
  return ["A", "B", "C", "DOROST"].includes(t) ? t : null;
}

function fmtDate(iso) {
  // YYYY-MM-DD -> D.M.YYYY (když je ISO); jinak vrátí původní text
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
}

function renderTable(finalTable) {
  if (!finalTable || !Array.isArray(finalTable.columns) || !Array.isArray(finalTable.rows)) {
    return `<p><em>Tabulka pro tuto sezónu není uložená.</em></p>`;
  }

  const cols = finalTable.columns;

  // rows jsou uložené jako array-of-objects {c0,c1,...}
  const rows = finalTable.rows.map(obj =>
    cols.map((_, i) => (obj?.["c" + i] ?? "").toString())
  );

  const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("");

  return `<table class="tabulka">${head}${body}</table>`;
}

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
        <button class="btn-primary" type="button" data-season="${esc(s.id)}">Otevřít</button>
      </div>
    `;
  }).join("");

  seasonsWrap.querySelectorAll("button[data-season]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const seasonId = btn.getAttribute("data-season");
      await showSeasonDetail(teamId, seasonId);

      // volitelně: posun na detail
      // detailEl?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      ${url
        ? `<a class="btn-primary" href="${esc(url)}" target="_blank" rel="noopener">Otevřít: ${esc(label)}</a>`
        : `<p><em>Souhrnný zpravodaj není uložen.</em></p>`
      }
    `;
    return;
  }

  // A/B/C: tabulka snapshot + zápasy (pastList)
  const tableHtml = renderTable(data?.finalTable);

  const pastList = Array.isArray(data?.pastList) ? data.pastList : [];
  const matchesHtml = pastList.length
    ? `<div style="margin-top:12px;">
         <h4 style="margin:10px 0 6px 0; color:#ffd700;">Zápasy (uložený snapshot)</h4>
         ${pastList
           .slice()
           .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
           .map(m => {
             const r = m.round ?? "";
             const dt = fmtDate(m.date ?? "");
             const home = m.home ?? "";
             const away = m.away ?? "";
             const res = m.result ?? "";
             const pins = m.pins ?? "";
             return `<div style="margin:2px 0;">
               <strong>${esc(r)}. kolo</strong>
               ${esc(dt)}
               ${esc(home)} - ${esc(away)}
               <strong>${esc(res)}</strong>
               ${esc(pins)}
             </div>`;
           }).join("")}
       </div>`
    : `<div style="margin-top:12px;">
         <h4 style="margin:10px 0 6px 0; color:#ffd700;">Zápasy (uložený snapshot)</h4>
         <p><em>V této sezóně nejsou uložené žádné zápasy.</em></p>
       </div>`;

  detailEl.innerHTML = `
    <h3 style="margin-top:0; color:#ffd700;">Sezóna ${esc(seasonId)}</h3>
    <h4 style="margin:10px 0 6px 0; color:#ffd700;">Tabulka (uložený snapshot)</h4>
    ${tableHtml}
    ${matchesHtml}
  `;
}

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

  // ✅ Nezobrazuj nic automaticky – detail až po kliknutí
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
