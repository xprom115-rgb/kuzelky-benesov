import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("pastRoundsList");

// ---------------------------------------------------------
// CSS: zvýraznění výhry, prohry a remízy
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
    .match-win {
      background: rgba(20, 120, 60, 0.55) !important;
      border-left: 8px solid rgba(46, 204, 113, 0.95);
    }

    .match-loss {
      background: rgba(140, 40, 30, 0.55) !important;
      border-left: 8px solid rgba(231, 76, 60, 0.95);
    }

    .match-draw {
      background: rgba(160, 120, 0, 0.50) !important;
      border-left: 8px solid rgba(241, 196, 15, 0.95);
    }
  `;
  document.head.appendChild(style);
})();

// ---------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------
function esc(value) {
  return (value ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(iso) {
  if (!iso) return "";

  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;

  return `${Number(match[3])}.${Number(match[2])}.${match[1]}`;
}

function toDateTime(date, time = "00:00") {
  if (!date) return null;

  const safeTime = /^\d{2}:\d{2}$/.test(time || "")
    ? time
    : "00:00";

  const parsed = new Date(`${date}T${safeTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTeamId() {
  const params = new URLSearchParams(location.search);
  const fromQuery = (params.get("team") || "").toUpperCase();

  if (["A", "B", "C"].includes(fromQuery)) {
    return fromQuery;
  }

  const path = (location.pathname || "").toLowerCase();

  if (path.includes("druzstvo-a")) return "A";
  if (path.includes("druzstvo-b")) return "B";
  if (path.includes("druzstvo-c")) return "C";

  return null;
}

function normalizeName(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(tj|sokol|sk|kk)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isBenesovName(value) {
  return normalizeName(value).includes("benesov");
}

function matchTeamsKey(match) {
  const home = normalizeName(match.home);
  const away = normalizeName(match.away);
  return [home, away].sort().join("|");
}

// Výsledek může být například 6:2 nebo 5,5:2,5.
function parseResult(resultString) {
  const clean = (resultString || "")
    .toString()
    .trim()
    .replace(/\s+/g, "");

  const parts = clean.split(":");
  if (parts.length !== 2) return null;

  const left = Number(parts[0].replace(",", "."));
  const right = Number(parts[1].replace(",", "."));

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }

  return { left, right };
}

function resultClass(match) {
  const homeIsBenesov = isBenesovName(match.home);
  const awayIsBenesov = isBenesovName(match.away);

  if (!homeIsBenesov && !awayIsBenesov) return "";

  const result = parseResult(match.result);
  if (!result) return "";

  const benesov = homeIsBenesov ? result.left : result.right;
  const opponent = homeIsBenesov ? result.right : result.left;

  if (benesov > opponent) return "match-win";
  if (benesov < opponent) return "match-loss";
  return "match-draw";
}

function normalizeManualPast(pastMap) {
  const output = [];

  for (const key of Object.keys(pastMap || {})) {
    const item = pastMap[key] || {};
    const round = Number(item.round ?? key);
    const date = (item.date || "").trim();
    const time = (item.time || "").trim();
    const home = (item.home || "").trim();
    const away = (item.away || "").trim();
    const result = (item.result || item.score || "").trim();
    const pins = (item.pins || "").trim();

    if (!round || !date || !home || !away) continue;

    output.push({
      round,
      date,
      time: time || null,
      home,
      away,
      result,
      pins,
      url: item.url || null,
      source: "manual",
    });
  }

  return output;
}

function normalizeAutomaticPast(teamData) {
  const source = Array.isArray(teamData?.pastMatches)
    ? teamData.pastMatches
    : [];

  const output = [];

  for (const item of source) {
    const round = Number(item?.round);
    const date = (item?.date || "").trim();
    const time = (item?.time || "").trim();
    const home = (item?.home || "").trim();
    const away = (item?.away || "").trim();
    const result = (item?.result || item?.score || "").trim();
    const pins = (item?.pins || "").trim();

    if (!round || !date || !home || !away) continue;

    output.push({
      round,
      date,
      time: time || null,
      home,
      away,
      result,
      pins,
      url: item?.url || null,
      source: "automatic",
    });
  }

  return output;
}

function mergePastMatches(manualMatches, automaticMatches) {
  /*
   * Ruční zápis má vždy přednost před automatickým.
   * Datum ani čas nejsou součástí kontroly duplicity, protože utkání
   * může být předehráno nebo přeloženo na jiný termín.
   */
  const manualRounds = new Set(
    manualMatches
      .map((match) => Number(match.round))
      .filter((round) => Number.isFinite(round) && round > 0)
  );

  const manualTeamKeys = new Set(
    manualMatches
      .map(matchTeamsKey)
      .filter(Boolean)
  );

  const automaticOnly = automaticMatches.filter((match) => {
    const sameRoundExists = manualRounds.has(Number(match.round));
    const sameTeamsExist = manualTeamKeys.has(matchTeamsKey(match));

    return !sameRoundExists && !sameTeamsExist;
  });

  const merged = [...manualMatches, ...automaticOnly];

  merged.sort((first, second) => {
    const firstDate = toDateTime(first.date, first.time || "00:00");
    const secondDate = toDateTime(second.date, second.time || "00:00");

    if (firstDate && secondDate && firstDate.getTime() !== secondDate.getTime()) {
      return secondDate - firstDate;
    }

    return Number(second.round || 0) - Number(first.round || 0);
  });

  return merged;
}

async function loadAutomaticTeamData(teamId) {
  const url = new URL(
    `./data/teams/${encodeURIComponent(teamId)}.json`,
    document.baseURI
  );

  // Zamezí použití starší verze JSON uložené v cache prohlížeče.
  url.searchParams.set("v", Date.now().toString());

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Automatická data ${teamId}.json nelze načíst: HTTP ${response.status}`
    );
  }

  return response.json();
}

function renderTable(list) {
  if (!el) return;

  if (!list.length) {
    el.innerHTML = "<p><em>Zatím nejsou zadané žádné výsledky.</em></p>";
    return;
  }

  const rows = list.map((match) => {
    const dateText = match.time
      ? `${fmtDate(match.date)} ${match.time}`
      : fmtDate(match.date);

    const home = esc(match.home);
    const away = esc(match.away);

    const homeHtml = match.url && match.source === "automatic"
      ? `<a href="${esc(match.url)}" target="_blank" rel="noopener noreferrer">${home}</a>`
      : home;

    const awayHtml = match.url && match.source === "automatic"
      ? `<a href="${esc(match.url)}" target="_blank" rel="noopener noreferrer">${away}</a>`
      : away;

    return `
      <tr class="${resultClass(match)}">
        <td><strong>${esc(match.round)}.</strong></td>
        <td>${esc(dateText)}</td>
        <td>${homeHtml}</td>
        <td>${awayHtml}</td>
        <td><strong>${esc(match.result)}</strong></td>
        <td>${esc(match.pins)}</td>
      </tr>
    `;
  }).join("");

  el.innerHTML = `
    <table class="tabulka matches-table">
      <tr>
        <th>Kolo</th>
        <th>Datum a čas</th>
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
// Inicializace
// ---------------------------------------------------------
async function init() {
  if (!el) return;

  const teamId = getTeamId();

  if (!teamId) {
    el.innerHTML = "<p><em>Chybí identifikace týmu (A/B/C).</em></p>";
    return;
  }

  el.innerHTML = "<p><em>Načítám…</em></p>";

  let manualMatches = [];
  let automaticMatches = [];
  let manualError = null;
  let automaticError = null;

  try {
    const ref = doc(db, "team_current", teamId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      const past = (
        data.past
        && typeof data.past === "object"
        && !Array.isArray(data.past)
      ) ? data.past : {};

      manualMatches = normalizeManualPast(past);
    }
  } catch (error) {
    manualError = error;
    console.error("Nelze načíst ručně zadané minulé zápasy:", error);
  }

  try {
    const automaticData = await loadAutomaticTeamData(teamId);
    automaticMatches = normalizeAutomaticPast(automaticData);
  } catch (error) {
    automaticError = error;
    console.error("Nelze načíst automatické minulé zápasy:", error);
  }

  if (manualError && automaticError) {
    el.innerHTML = (
      "<p><em>Nelze načíst ruční ani automatické výsledky zápasů.</em></p>"
    );
    return;
  }

  const list = mergePastMatches(
    manualMatches,
    automaticMatches
  );

  renderTable(list);
}

init();
