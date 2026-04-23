import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("futureRoundsList");

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtDate(iso) {
  // YYYY-MM-DD -> D.M.YYYY
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
}

function getTeamId() {
  // preferujeme ?team=A|B|C
  const p = new URLSearchParams(location.search);
  const t = (p.get("team") || "").toUpperCase();
  if (["A", "B", "C"].includes(t)) return t;

  // fallback podle názvu souboru
  const path = (location.pathname || "").toLowerCase();
  if (path.includes("druzstvo-a")) return "A";
  if (path.includes("druzstvo-b")) return "B";
  if (path.includes("druzstvo-c")) return "C";
  return null;
}

function normalizeFuture(futureMap) {
  // futureMap: { "1": {round,date,home,away}, ... }
  const out = [];
  for (const key of Object.keys(futureMap || {})) {
    const it = futureMap[key] || {};
    const round = Number(it.round ?? key);
    const date = (it.date || "").trim();
    const home = (it.home || "").trim();
    const away = (it.away || "").trim();

    if (!round || !date || !home || !away) continue;

    out.push({ round, date, home, away });
  }
  // řazení podle kola
  out.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  return out;
}

function render(list) {
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<p><em>Zatím nejsou zadané žádné budoucí zápasy.</em></p>`;
    return;
  }

  el.innerHTML = list.map(m => {
    return `<div style="margin:2px 0;">
      <strong>${esc(m.round)}. kolo</strong>
      ${esc(fmtDate(m.date))}
      ${esc(m.home)} - ${esc(m.away)}
    </div>`;
  }).join("");
}

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

    render(list);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p><em>Nelze načíst budoucí zápasy (zkontroluj Firestore Rules pro team_current).</em></p>`;
  }
}

init();
