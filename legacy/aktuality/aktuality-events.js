// =========================================================
// aktuality-events.js
// - Vypíše akce (events) do Aktualit
// - Zobrazuje SKUTEČNÝ čas akce: start–end
// - Filtruje jen dnešní a budoucí akce
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const el = document.getElementById("eventsNews");

function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(iso) {
  // YYYY-MM-DD -> D.M.YYYY
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
}

function label(ev) {
  if (ev.type === "match") return `Zápas ${ev.team || ""}`.trim();
  return ev.title || "Turnaj";
}

async function init() {
  if (!el) return;

  el.innerHTML = "<em>Načítám…</em>";

  try {
    // řazení podle date/start (bez where – méně problémů s indexy)
    const q = query(collection(db, "events"), orderBy("date"), orderBy("start"));
    const snap = await getDocs(q);

    const today = todayIso();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(ev => (ev.date || "") >= today);

    if (!items.length) {
      el.innerHTML = "<em>Zatím nejsou naplánované žádné akce.</em>";
      return;
    }

    el.innerHTML = items.map(ev => {
      // zobrazujeme skutečný čas (start–end), ne blokaci
      return `<div style="margin:2px 0;">
        <strong>${esc(fmtDate(ev.date))}</strong> —
        <strong>${esc(ev.start)}–${esc(ev.end)}</strong> —
        ${esc(label(ev))}
        ${ev.note ? ` — <span style="opacity:0.85;">${esc(ev.note)}</span>` : ""}
      </div>`;
    }).join("");

  } catch (e) {
    console.error(e);
    el.innerHTML = "<em>Nelze načíst akce (zkontroluj Firestore Rules pro events).</em>";
  }
}

init();
