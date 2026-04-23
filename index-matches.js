import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("matchesTile");

const TEAM_LABEL = {
  A: "TJ Sokol Benešov A",
  B: "TJ Sokol Benešov B",
  C: "TJ Sokol Benešov C"
};

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${Number(d)}.${Number(m)}.${y}`;
}

function toDate(iso) {
  return iso ? new Date(iso + "T00:00:00") : null;
}

function todayMidnight() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

async function loadTeamDoc(teamId) {
  const ref = doc(db, "team_current", teamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { teamId, future: {}, past: {} };
  const data = snap.data();
  return {
    teamId,
    future: (data.future && typeof data.future === "object") ? data.future : {},
    past: (data.past && typeof data.past === "object") ? data.past : {}
  };
}

function pickMaxRoundFromMap(mapObj, filterFn) {
  // mapObj: { "1": {...}, "2": {...} }
  let best = null;
  for (const k of Object.keys(mapObj || {})) {
    const it = mapObj[k] || {};
    const round = Number(it.round ?? k);
    if (!round || !Number.isFinite(round)) continue;
    if (filterFn && !filterFn(it, round)) continue;
    if (!best || round > best.round) best = { round, it };
  }
  return best; // {round, it} | null
}

function renderLineFuture(teamId, m) {
  const it = m.it;
  return `<div style="margin:2px 0;">
    <strong>${esc(TEAM_LABEL[teamId])}:</strong>
    <strong>${esc(m.round)}. kolo</strong>
    ${esc(fmtDate(it.date))}
    ${esc(it.home)} - ${esc(it.away)}
  </div>`;
}

function renderLinePast(teamId, m) {
  const it = m.it;
  return `<div style="margin:2px 0;">
    <strong>${esc(TEAM_LABEL[teamId])}:</strong>
    <strong>${esc(m.round)}. kolo</strong>
    ${esc(fmtDate(it.date))}
    ${esc(it.home)} - ${esc(it.away)}
    <strong>${esc(it.result || "")}</strong>
    ${esc(it.pins || "")}
  </div>`;
}

async function init() {
  if (!el) return;

  try {
    el.innerHTML = "<em>Načítám…</em>";

    const [A, B, C] = await Promise.all([
      loadTeamDoc("A"),
      loadTeamDoc("B"),
      loadTeamDoc("C")
    ]);

    const today = todayMidnight();

    // Budoucí: jen datum >= dnes a vyber max kolo
    const futureA = pickMaxRoundFromMap(A.future, (it) => {
      const dt = toDate(it.date);
      return dt && dt >= today && it.home && it.away;
    });
    const futureB = pickMaxRoundFromMap(B.future, (it) => {
      const dt = toDate(it.date);
      return dt && dt >= today && it.home && it.away;
    });
    const futureC = pickMaxRoundFromMap(C.future, (it) => {
      const dt = toDate(it.date);
      return dt && dt >= today && it.home && it.away;
    });

    // Poslední (odehrané): vyber max kolo z past
    const pastA = pickMaxRoundFromMap(A.past, (it) => it.date && it.home && it.away && it.result && it.pins);
    const pastB = pickMaxRoundFromMap(B.past, (it) => it.date && it.home && it.away && it.result && it.pins);
    const pastC = pickMaxRoundFromMap(C.past, (it) => it.date && it.home && it.away && it.result && it.pins);

    const futureLines = [
      futureA ? renderLineFuture("A", futureA) : `<div><strong>${esc(TEAM_LABEL.A)}:</strong> <em>bez budoucího zápasu</em></div>`,
      futureB ? renderLineFuture("B", futureB) : `<div><strong>${esc(TEAM_LABEL.B)}:</strong> <em>bez budoucího zápasu</em></div>`,
      futureC ? renderLineFuture("C", futureC) : `<div><strong>${esc(TEAM_LABEL.C)}:</strong> <em>bez budoucího zápasu</em></div>`
    ].join("");

    const pastLines = [
      pastA ? renderLinePast("A", pastA) : `<div><strong>${esc(TEAM_LABEL.A)}:</strong> <em>bez posledního zápasu</em></div>`,
      pastB ? renderLinePast("B", pastB) : `<div><strong>${esc(TEAM_LABEL.B)}:</strong> <em>bez posledního zápasu</em></div>`,
      pastC ? renderLinePast("C", pastC) : `<div><strong>${esc(TEAM_LABEL.C)}:</strong> <em>bez posledního zápasu</em></div>`
    ].join("");

    el.innerHTML = `
      <div style="margin-top:6px;">
        <div style="font-weight:bold; color:#ffd700;">Budoucí zápas (nejvyšší kolo)</div>
        <div style="margin-top:6px;">${futureLines}</div>
      </div>

      <div style="margin-top:12px;">
        <div style="font-weight:bold; color:#ffd700;">Poslední zápas</div>
        <div style="margin-top:6px;">${pastLines}</div>
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = "<em>Nelze načíst zápasy (zkontroluj Firestore Rules pro team_current).</em>";
  }
}

init();
