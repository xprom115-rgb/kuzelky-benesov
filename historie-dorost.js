import { db } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const listEl = document.getElementById("dorostHistoryList");

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buttonLink(url, text) {
  if (!url) return `<em>Bez odkazu</em>`;
  const safeUrl = esc(url);
  const label = esc(text || "Otevřít");
  return `<a class="btn-primary" href="${safeUrl}" target="_blank" rel="noopener">${label}</a>`;
}

function renderEmpty(msg) {
  if (!listEl) return;
  listEl.innerHTML = `<p><em>${esc(msg)}</em></p>`;
}

function renderSeasons(seasons) {
  if (!listEl) return;

  if (!seasons.length) {
    renderEmpty("Zatím není uložená žádná sezóna dorostu.");
    return;
  }

  const html = seasons.map(s => {
    const seasonTitle = s.seasonId || s.id || "Sezóna";
    const url = s.summaryBulletin?.url || "";
    const title = s.summaryBulletin?.title || "Souhrnný zpravodaj (8. kolo)";

    return `
      <div class="hist-tile">
        <div>
          <h3>${esc(seasonTitle)}</h3>
          <div class="desc">Archiv: ${esc(title)}</div>
        </div>
        ${buttonLink(url, "Otevřít")}
      </div>
    `;
  }).join("");

  listEl.innerHTML = html;
}

async function loadDorostHistory() {
  renderEmpty("Načítám historii…");

  try {
    const colRef = collection(db, "team_history", "DOROST", "seasons");
    const snap = await getDocs(colRef);

    const seasons = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // řazení: nejdřív podle seasonId (když je), jinak podle id dokumentu
    seasons.sort((a, b) => {
      const aa = (a.seasonId || a.id || "").toString();
      const bb = (b.seasonId || b.id || "").toString();
      return bb.localeCompare(aa);
    });

    renderSeasons(seasons);
  } catch (e) {
    console.error(e);
