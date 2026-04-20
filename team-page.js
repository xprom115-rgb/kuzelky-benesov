import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const TEAM_ID = params.get("team"); // "A" | "B" | "C" | "DOROST"

const elTitle = document.getElementById("teamTitle");
const elUpdated = document.getElementById("teamUpdated");
const elLast = document.getElementById("lastMatch");
const elNext = document.getElementById("nextMatch");
const elTable = document.getElementById("tableWrap");
const elBulletins = document.getElementById("bulletinsWrap");

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function yesNoHome(v) {
  if (v === true) return "doma";
  if (v === false) return "venku";
  return "—";
}

function linkHtml(url, text) {
  if (!url) return "";
  const safe = esc(url);
  const label = esc(text || "Otevřít");
  return `<a href="${safe}" target="_blank" rel="noopener">${label}</a>`;
}

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

  const score = (typeof match.scoreHome === "number" && typeof match.scoreAway === "number")
    ? `${match.scoreHome} : ${match.scoreAway}`
    : (match.score ? esc(match.score) : "—");

  const pins = (typeof match.pinsHome === "number" && typeof match.pinsAway === "number")
    ? `${match.pinsHome} : ${match.pinsAway}`
    : (match.pins ? esc(match.pins) : "");

  const link = match.matchUrl || match.url;

  boxEl.innerHTML = `
    <div class="feed-card">
      <div><strong>${date}${time}</strong> • ${hv} • ${opp}</div>
      <div style="margin-top:6px;">
        <span style="font-weight:bold;">Skóre:</span> ${score}
        ${pins ? ` • <span style="font-weight:bold;">Kuželky:</span> ${pins}` : ""}
      </div>
      ${link ? `<div style="margin-top:8px;">${linkHtml(link, "Detail zdroje")}</div>` : ""}
    </div>
  `;
}

/**
 * Tabulka (A/B/C) – dynamicky podle columns a rows (array-of-arrays).
 * Zvýrazní Benešov přes window.__teamKey (název družstva).
 */
function renderTable(table) {
  if (!elTable) return;

  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    elTable.innerHTML = `<p><em>Tabulka zatím není naimportována.</em></p>`;
    return;
  }

  const cols = Array.isArray(table.columns) && table.columns.length
    ? table.columns
    : ["#","Družstvo","Body","Zápasy","Skóre","Průměr"];

  const teamKey = (window.__teamKey || "").toLowerCase().trim();

  const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;

  const body = table.rows.map(r => {
    if (!Array.isArray(r)) return "";
    let rowArr = r.slice(0, cols.length);
    if (rowArr.length < cols.length) rowArr = rowArr.concat(Array(cols.length - rowArr.length).fill(""));

    const rowText = rowArr.join(" ").toLowerCase();
    const isBenesov = teamKey && rowText.includes(teamKey);

    return `<tr class="${isBenesov ? "is-benesov" : ""}">
      ${rowArr.map(x => `<td>${esc(x)}</td>`).join("")}
    </tr>`;
  }).join("");

  elTable.innerHTML = `<table class="tabulka">${head}${body}</table>`;
}

/**
 * ✅ Dorost – záložky podle kol z Firestore mapy bulletins:
