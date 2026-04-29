import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("futureRoundsList");

// ---------------------------------------------------------
// CSS: tmavší zvíraznění buněk
// ---------------------------------------------------------
(function injectStyles() {
  const id = "abcMatchesStyles";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    /* Čitelnost tabulek přes fotku pozadí */
    .tabulka td { background: rgba(0,0,0,0.18); }
    .tabulka tr:hover td { background: rgba(0,0,0,0.28); }

    /* Tabulka zápasů */
    .matches-table td, .matches-table th { vertical-align: middle; }
  `;
  document.head.appendChild(style);
})();

// ---------------------------------------------------------
// Helpery
// ---------------------------------------------------------
function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtDate(iso) {
  // YYYY-MM-DD -> D.M.YYYY
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
}

function toDate(iso) {
  return iso ? new Date(iso + "T00:00:00") : null;
}

function todayMidnight() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function getTeamId() {
  const p = new URLSearchParams(location.search);
  const t = (p.get("team") || "").toUpperCase();
  if (["A", "B", "C"].includes(t)) return t;

  const path = (location.pathname || "").toLowerCase();
  if (path.includes("druzstvo-a")) return "A";
  if (path.includes("druzstvo-b")) return "B";
  if (path.includes("druzstvo-c")) return "C";
  return null;
}

function normalizeFuture(futureMap) {
  const today = todayMidnight();
  const out = [];

  for (const key of Object.keys(futureMap || {})) {
    const it = futureMap[key] || {};
    const round = Number(it.round ?? key);
    const date = (it.date || "").trim();
    const home = (it.home || "").trim();
    const away = (it.away || "").trim();

    if (!round || !date || !home || !away) continue;

    const dt = toDate(date);
    if (!dt || dt < today) continue; // ✅ skrýt už odehrané podle data

    out.push({ round, date, home, away });
  }

  // řazení podle kola
  out.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  return out;
}

function renderTable(list) {
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<p><em>Zatím nejsou zadané žádné budoucí zápasy.</em></p>`;
    return;
  }

  const rows = list.map(m => `
    <tr>
      <td><strong>${esc(m.round)}.</strong></td>
      <td>${esc(fmtDate(m.date))}</td>
      <td>${esc(m.home)}</td>
      <td>${esc(m.away)}</td>
    </tr>
  `).join("");

  el.innerHTML = `
    <table class="tabulka matches-table">
      <tr>
        <th>Kolo</th>
        <th>Datum</th>
        <th>Domácí</th>
        <th>Hosté</th>
      </tr>
      ${rows}
    </table>
  `;
}

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
async function init() {
  if (!el) return;

  const teamId = getTeamId();
  if (!teamId) {
    el.innerHTML = `<p><em>Chybí identifikace týmu (A/B/C).</em></p>`;
    return;
  }

  try {
    el.innerHTML = `<p><em>Načítám…</em></p>`;

    const ref = doc(db, "team_current", teamId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      el.innerHTML = `<p><em>Neexistuje team_current/${esc(teamId)}.</em></p>`;
      return;
    }

    const data = snap.data();
    const future = (data.future && typeof data.future === "object") ? data.future : {};
    const list = normalizeFuture(future);

    renderTable(list);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p><em>Nelze načíst budoucí zápasy (zkontroluj Firestore Rules pro team_current).</em></p>`;
  }
}

init();
