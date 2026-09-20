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

function toDateTime(date, time = "00:00") {
  if (!date) return null;

  const safeTime = /^\d{2}:\d{2}$/.test(time || "")
    ? time
    : "00:00";

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

function normalizeManualMap(sourceMap, teamId, kind) {
  const output = [];

  for (const key of Object.keys(sourceMap || {})) {
    const item = sourceMap[key] || {};
    const round = Number(item.round ?? key);
    const date = (item.date || "").trim();
    const time = (item.time || "").trim();
    const home = (item.home || "").trim();
    const away = (item.away || "").trim();
    const result = (item.result || item.score || "").trim();
    const pins = (item.pins || "").trim();
    const dateTime = toDateTime(date, time || (kind === "future" ? "23:59" : "00:00"));

    if (!round || !date || !home || !away || !dateTime) continue;

    output.push({
      teamId,
      round,
      date,
      time: time || null,
      home,
      away,
      result: result || null,
      pins: pins || null,
      url: item.url || null,
      source: "manual",
      dateTime,
    });
  }

  return output;
}

function normalizeAutomaticList(sourceList, teamId, kind) {
  const output = [];

  for (const item of Array.isArray(sourceList) ? sourceList : []) {
    const round = Number(item?.round);
    const date = (item?.date || "").trim();
    const time = (item?.time || "").trim();
    const home = (item?.home || "").trim();
    const away = (item?.away || "").trim();
    const result = (item?.result || item?.score || "").trim();
    const pins = (item?.pins || "").trim();
    const dateTime = toDateTime(date, time || (kind === "future" ? "23:59" : "00:00"));

    if (!round || !date || !home || !away || !dateTime) continue;

    output.push({
      teamId,
      round,
      date,
      time: time || null,
      home,
      away,
      result: result || null,
      pins: pins || null,
      url: item?.url || null,
      source: "automatic",
      dateTime,
    });
  }

  return output;
}

function mergeWithManualPriority(manualMatches, automaticMatches) {
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

async function loadFirestoreTeam(teamId) {
  const reference = doc(db, "team_current", teamId);
  const snapshot = await getDoc(reference);

  if (!snapshot.exists()) {
    return { future: [], past: [] };
  }

  const data = snapshot.data();
  const futureMap = (
    data.future
    && typeof data.future === "object"
    && !Array.isArray(data.future)
  ) ? data.future : {};
  const pastMap = (
    data.past
    && typeof data.past === "object"
    && !Array.isArray(data.past)
  ) ? data.past : {};

  return {
    future: normalizeManualMap(futureMap, teamId, "future"),
    past: normalizeManualMap(pastMap, teamId, "past"),
  };
}

async function loadAutomaticTeam(teamId) {
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

  return {
    future: normalizeAutomaticList(data.futureMatches, teamId, "future"),
    past: normalizeAutomaticList(data.pastMatches, teamId, "past"),
  };
}

async function loadTeamSummary(teamId) {
  const [manualResult, automaticResult] = await Promise.allSettled([
    loadFirestoreTeam(teamId),
    loadAutomaticTeam(teamId),
  ]);

  const manual = manualResult.status === "fulfilled"
    ? manualResult.value
    : { future: [], past: [] };
  const automatic = automaticResult.status === "fulfilled"
    ? automaticResult.value
    : { future: [], past: [] };

  if (manualResult.status === "rejected") {
    console.error(`Ruční zápasy družstva ${teamId} nelze načíst:`, manualResult.reason);
  }

  if (automaticResult.status === "rejected") {
    console.error(`Automatické zápasy družstva ${teamId} nelze načíst:`, automaticResult.reason);
  }

  const now = new Date();
  const future = mergeWithManualPriority(manual.future, automatic.future)
    .filter((match) => match.dateTime >= now)
    .sort((a, b) => a.dateTime - b.dateTime);

  const past = mergeWithManualPriority(manual.past, automatic.past)
    .filter((match) => match.dateTime < now || match.result || match.pins)
    .sort((a, b) => b.dateTime - a.dateTime);

  return {
    teamId,
    next: future[0] || null,
    last: past[0] || null,
  };
}

function teamLabel(teamId) {
  return `TJ Sokol Benešov ${teamId}`;
}

function renderNextMatch(summary) {
  const match = summary.next;

  if (!match) {
    return `<div><strong>${esc(teamLabel(summary.teamId))}:</strong> <em>bez nadcházejícího zápasu</em></div>`;
  }

  const timeText = match.time ? ` v ${esc(match.time)}` : "";
  const text = `
    <strong>${esc(teamLabel(summary.teamId))}:</strong>
    ${esc(match.round)}. kolo
    ${esc(fmtDate(match.date))}${timeText}
    ${esc(match.home)} – ${esc(match.away)}
  `;

  if (match.url && match.source === "automatic") {
    return `<div><a href="${esc(match.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;">${text}</a></div>`;
  }

  return `<div>${text}</div>`;
}

function renderLastMatch(summary) {
  const match = summary.last;

  if (!match) {
    return `<div><strong>${esc(teamLabel(summary.teamId))}:</strong> <em>bez posledního zápasu</em></div>`;
  }

  const scoreText = match.result
    ? `, výsledek <strong>${esc(match.result)}</strong>`
    : "";
  const pinsText = match.pins
    ? `, kuželky ${esc(match.pins)}`
    : "";

  const text = `
    <strong>${esc(teamLabel(summary.teamId))}:</strong>
    ${esc(match.round)}. kolo
    ${esc(fmtDate(match.date))}
    ${esc(match.home)} – ${esc(match.away)}
    ${scoreText}${pinsText}
  `;

  if (match.url && match.source === "automatic") {
    return `<div><a href="${esc(match.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;">${text}</a></div>`;
  }

  return `<div>${text}</div>`;
}

function render(summaries) {
  if (!el) return;

  el.innerHTML = `
    <div style="line-height:1.45;">
      <div style="font-weight:700; color:#ffd700; margin-bottom:2px;">Nejbližší zápas</div>
      ${summaries.map(renderNextMatch).join("")}

      <div style="font-weight:700; color:#ffd700; margin-top:8px; margin-bottom:2px;">Poslední zápas</div>
      ${summaries.map(renderLastMatch).join("")}
    </div>
  `;
}

async function init() {
  if (!el) return;

  el.innerHTML = "<em>Načítám…</em>";

  try {
    const summaries = await Promise.all(
      TEAM_IDS.map((teamId) => loadTeamSummary(teamId))
    );

    render(summaries);
  } catch (error) {
    console.error("Nelze načíst přehled utkání:", error);
    el.innerHTML = "<em>Přehled utkání se nyní nepodařilo načíst.</em>";
  }
}

init();
