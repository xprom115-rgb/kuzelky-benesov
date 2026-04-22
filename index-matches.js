import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("matchesTile");

const TEAM_LABEL = {
  A: "TJ Sokol Benešov A",
  B: "TJ Sokol Benešov B",
  C: "TJ Sokol Benešov C"
};

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtDate(iso) {
  // ISO: YYYY-MM-DD → DD.MM.YYYY
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

function toDate(iso) {
  // bezpečně: půlnoc lokálně
  return iso ? new Date(iso + "T00:00:00") : null;
}

async function loadTeam(teamId) {
  const ref = doc(db, "team_current", teamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { teamId, future: {} };
  const data = snap.data();
  const future = (data.future && typeof data.future === "object") ? data.future : {};
  return { teamId, future };
}

function normalizeFuture(teamId, futureMap) {
  // futureMap: { "1": {round,date,home,away}, ... }
  const out = [];
  for (const k of Object.keys(futureMap || {})) {
    const item = futureMap[k] || {};
    const roundNum = Number(item.round ?? k);
    const date = (item.date || "").trim();
    const home = (item.home || "").trim();
    const away = (item.away || "").trim();
    if (!date || !home || !away) continue;

    out.push({
      teamId,
      teamLabel: TEAM_LABEL[teamId] || teamId,
      round: Number.isFinite(roundNum) ? roundNum : 0,
      date,
      home,
      away,
      dt: toDate(date)
    });
  }
  return out;
}

function render(groups) {
  if (!el) return;

  const any = Object.values(groups).some(arr => arr.length > 0);
  if (!any) {
    el.innerHTML = "<em>Zatím nejsou zadané žádné budoucí zápasy.</em>";
    return;
  }

  const html = ["A", "B", "C"].map(tid => {
    const arr = groups[tid] || [];
    if (!arr.length) return "";

    const lines = arr.map(m => {
      return `<div style="margin:2px 0;">
        <strong>${escapeHtml(m.round)}. kolo</strong>
        ${escapeHtml(fmtDate(m.date))}
        ${escapeHtml(m.home)} - ${escapeHtml(m.away)}
      </div>`;
    }).join("");

    return `<div style="margin-top:10px;">
      <div style="font-weight:bold; color:#ffd700;">${escapeHtml(TEAM_LABEL[tid])}</div>
      <div style="margin-top:6px;">${lines}</div>
    </div>`;
  }).join("");

  el.innerHTML = html;
}

async function init() {
  if (!el) return;

  try {
    el.innerHTML = "<em>Načítám…</em>";

    const [a, b, c] = await Promise.all([
      loadTeam("A"),
      loadTeam("B"),
      loadTeam("C")
    ]);

    let all = [
      ...normalizeFuture("A", a.future),
      ...normalizeFuture("B", b.future),
      ...normalizeFuture("C", c.future)
    ];

    // jen budoucí (dnes a dál)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    all = all.filter(m => m.dt && m.dt >= today);

    // řazení: datum, pak kolo
    all.sort((x, y) => {
      const dx = x.dt?.getTime() ?? 0;
      const dy = y.dt?.getTime() ?? 0;
      if (dx !== dy) return dx - dy;
      return (x.round ?? 0) - (y.round ?? 0);
    });

    // rozdělení do skupin A/B/C
    const groups = { A: [], B: [], C: [] };
    for (const m of all) groups[m.teamId].push(m);

    render(groups);
  } catch (e) {
    console.error(e);
    el.innerHTML = "<em>Nelze načíst zápasy (zkontroluj Firestore Rules pro team_current).</em>";
  }
}

init();
