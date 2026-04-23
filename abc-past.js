import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("pastRoundsList");

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

function normalizePast(pastMap) {
  // pastMap: { "1": {round,date,home,away,result,pins}, ... }
  const out = [];
  for (const key of Object.keys(pastMap || {})) {
    const it = pastMap[key] || {};
    const round = Number(it.round ?? key);
    const date = (it.date || "").trim();
    const home = (it.home || "").trim();
    const away = (it.away || "").trim();
    const result = (it.result || "").trim();
    const pins = (it.pins || "").trim();

    if (!round || !date || !home || !away || !result || !pins) continue;
    out.push({ round, date, home, away, result, pins });
  }

  // řazení podle kola
  out.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  return out;
}

function render(list) {
  if (!el) return;

  if (!list.length) {
