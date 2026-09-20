import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("matchesTile");
const TEAM_IDS = ["A", "B", "C"];

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

function toDateTime(date, time = "23:59") {
  if (!date) return null;

  const safeTime = /^\d{2}:\d{2}$/.test(time || "")
    ? time
    : "23:59";

  const parsed = new Date(`${date}T${safeTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function teamsKey(match) {
  return [normalizeName(match.home), normalizeName(match.away)]
    .sort()
    .join("|");
}

function normalizeManualFuture(futureMap, teamId) {
  const now = new Date();
  const output = [];

  for (const key of Object.keys(futureMap || {})) {
    const item = futureMap[key] || {};
    const round = Number(item.round ?? key);
    const date = (item.date || "").trim();
    const time = (item.time || "").trim();
    const home = (item.home || "").trim();
    const away = (item.away || "").trim();
    const dateTime = toDateTime(date, time || "23:59");

    if (!round || !date || !home || !away || !dateTime) continue;
    if (dateTime < now) continue;

    output.push({
      teamId,
      round,
      date,
      time: time || null,
      home,
      away,
      url: item.url || null,
      source: "manual",
      dateTime,
    });
  }

  return output;
}

function normalizeAutomaticFuture(teamData, teamId) {
  const now = new Date();
  const source = Array.isArray(teamData?.futureMatches)
    ? teamData.futureMatches
    : [];
  const output = [];

  for (const item of source) {
    const round = Number(item?.round);
    const date = (item?.date || "").trim();
    const time = (item?.time || "").trim();
    const home = (item?.home || "").trim();
    const away = (item?.away || "").trim();
    const dateTime = toDateTime(date, time || "23:59");

    if (!round || !date || !home || !away || !dateTime) continue;
    if (dateTime < now) continue;

    output.push({
      teamId,
      round,
      date,
      time: time || null,
      home,
      away,
      url: item?.url || null,
      source: "automatic",
      dateTime,
    });
  }

  return output;
}

function mergeTeamMatches(manualMatches, automaticMatches) {
  // Ruční zápis má přednost. Datum se neporovnává kvůli předehrávkám.
  const manualRounds = new Set(
    manualMatches.map((match) => Number(match.round))
  );
  const manualTeamKeys = new Set(
    manualMatches.map(teamsKey).filter(Boolean)
  );

  const automaticOnly = automaticMatches.filter((match) => {
    const sameRound = manualRounds.has(Number(match.round));
    const sameTeams = manualTeamKeys.has(teamsKey(match));
    return !sameRound && !sameTeams;
  });

  return [...manualMatches, ...automaticOnly];
}

async function loadManualMatches(teamId) {
  const reference = doc(db, "team_current", teamId);
  const snapshot = await getDoc(reference);

  if (!snapshot.exists()) return [];

  const data = snapshot.data();
  const future = (
    data.future
    && typeof data.future === "object"
    && !Array.isArray(data.future)
  ) ? data.future : {};

  return normalizeManualFuture(future, teamId);
}

async function loadAutomaticMatches(teamId) {
  const url = new URL(
    `./data/teams/${encodeURIComponent(teamId)}.json`,
    document.baseURI
  );
  url.searchParams.set("v", Date.now().toString());

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${teamId}.json: HTTP ${response.status}`);
  }

  const data = await response.json();
  return normalizeAutomaticFuture(data, teamId);
}

async function loadTeamMatches(teamId) {
  const [manualResult, automaticResult] = await Promise.allSettled([
    loadManualMatches(teamId),
    loadAutomaticMatches(teamId),
  ]);

  const manualMatches = manualResult.status === "fulfilled"
    ? manualResult.value
    : [];
  const automaticMatches = automaticResult.status === "fulfilled"
    ? automaticResult.value
    : [];

  if (manualResult.status === "rejected") {
    console.error(`Ruční zápasy družstva ${teamId} nelze načíst:`, manualResult.reason);
  }

  if (automaticResult.status === "rejected") {
    console.error(`Automatické zápasy družstva ${teamId} nelze načíst:`, automaticResult.reason);
  }

  return mergeTeamMatches(manualMatches, automaticMatches);
}

function matchLink(match, text) {
  if (!match.url || match.source !== "automatic") {
    return esc(text);
  }

  return `<a href="${esc(match.url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
}

function render(matches) {
  if (!el) return;

  if (!matches.length) {
    el.innerHTML = "<em>Momentálně nejsou evidována žádná budoucí utkání.</em>";
    return;
  }

  matches.sort((first, second) => {
    const dateDifference = first.dateTime - second.dateTime;
    if (dateDifference !== 0) return dateDifference;
    return first.teamId.localeCompare(second.teamId, "cs");
  });

  const rows = matches.map((match) => {
    const when = match.time
      ? `${fmtDate(match.date)} v ${match.time}`
      : fmtDate(match.date);

    return `
      <tr>
        <td><strong>${esc(match.teamId)}</strong></td>
        <td>${esc(match.round)}.</td>
        <td>${esc(when)}</td>
        <td>${matchLink(match, match.home)}</td>
        <td>${matchLink(match, match.away)}</td>
      </tr>
    `;
  }).join("");

  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="tabulka matches-table" style="width:100%;">
        <thead>
          <tr>
            <th>Družstvo</th>
            <th>Kolo</th>
            <th>Termín</th>
            <th>Domácí</th>
            <th>Hosté</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function init() {
  if (!el) return;

  el.innerHTML = "<em>Načítám…</em>";

  try {
    const teamLists = await Promise.all(
      TEAM_IDS.map((teamId) => loadTeamMatches(teamId))
    );

    render(teamLists.flat());
  } catch (error) {
    console.error("Nelze načíst dlaždici utkání:", error);
    el.innerHTML = "<em>Utkání se nyní nepodařilo načíst.</em>";
  }
}

init();
