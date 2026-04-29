import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("pastRoundsList");

// ---------------------------------------------------------
// CSS: zvýraznění win/loss/draw (injekce)
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

    /* Výsledek Benešova */
    .match-win  { background: rgba(20, 120, 60, 0.55) !important; border-left: 8px solid rgba(46, 204, 113, 0.95); }
    .match-loss { background: rgba(140, 40, 30, 0.55) !important; border-left: 8px solid rgba(231, 76, 60, 0.95); }
    .match-draw { background: rgba(160, 120, 0, 0.50) !important; border-left: 8px solid rgba(241, 196, 15, 0.95); }
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
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
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

function isBenesovName(s) {
  return /benešov/i.test((s || "").toString());
}

// výsledek může být "6:2" nebo "5,5:2,5"
function parseResult(resultStr) {
  const clean = (resultStr || "").toString().trim().replace(/\s+/g, "");
  const parts = clean.split(":");
  if (parts.length !== 2) return null;
  const left = Number(parts[0].replace(",", "."));
  const right = Number(parts[1].replace(",", "."));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return { left, right };
}

function resultClass(m) {
  const homeIsBen = isBenesovName(m.home);
  const awayIsBen = isBenesovName(m.away);
  if (!homeIsBen && !awayIsBen) return "";

  const rr = parseResult(m.result);
  if (!rr) return "";

  const ben = homeIsBen ? rr.left : rr.right;
  const opp = homeIsBen ? rr.right : rr.left;

  if (ben > opp) return "match-win";
  if (ben < opp) return "match-loss";
  return "match-draw"; // i 0:0
}

function normalizePast(pastMap) {
  const out = [];
  for (const key of Object.keys(pastMap || {})) {
    const it = pastMap[key] || {};
    const round = Number(it.round ?? key);
    const date = (it.date || "").trim();
    const home = (it.home || "").trim();
    const away = (it.away || "").trim();
    const result = (it.result || "").trim();
    const pins = (it.pins || "").trim();

    if (!round || !date || !home || !away) continue;
    out.push({ round, date, home, away, result, pins });
  }
  out.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  return out;
}

function renderTable(list) {
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<p><em>Zatím nejsou zadané žádné výsledky.</em></p>`;
    return;
  }

  const rows = list.map(m => `
    <tr class="${resultClass(m)}">
      <td><strong>${esc(m.round)}.</strong></td>
      <td>${esc(fmtDate(m.date))}</td>
      <td>${esc(m.home)}</td>
      <td>${esc(m.away)}</td>
      <td><strong>${esc(m.result)}</strong></td>
      <td>${esc(m.pins)}</td>
    </tr>
  `).join("");

  el.innerHTML = `
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
    const past = (data.past && typeof data.past === "object") ? data.past : {};
    const list = normalizePast(past);

    renderTable(list);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p><em>Nelze načíst minulé zápasy (zkontroluj Firestore Rules pro team_current).</em></p>`;
  }
}

init();
