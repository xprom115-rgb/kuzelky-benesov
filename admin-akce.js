// =========================================================
// admin-akce.js
//
// ADMINISTRACE ZÁPASŮ A TURNAJŮ
//
// Skript umožňuje:
// 1) Přihlášení přes Firebase Authentication.
// 2) Uložení jedné akce na konkrétní datum.
// 3) Hromadné uložení stejné akce na více dnů v jednom měsíci.
// 4) Automatický výpočet blokace drah na celé hodiny.
// 5) Výpis a mazání uložených akcí.
//
// Každý vybraný den se uloží jako samostatný dokument
// v kolekci Firestore:
//
// events/{eventId}
//
// Struktura dokumentu:
// {
//   date:       "YYYY-MM-DD",
//   start:      "HH:MM",        // skutečný začátek pro Aktuality
//   end:        "HH:MM",        // skutečný konec pro Aktuality
//   blockStart: "HH:MM",        // blokace zaokrouhlená dolů
//   blockEnd:   "HH:MM",        // blokace zaokrouhlená nahoru
//   type:       "match" | "tournament",
//   team:       "A" | "B" | "C" | "DOROST" | null,
//   title:      string | null,
//   note:       string | null,
//   createdAt:  ISO string
// }
//
// Zápasy i turnaje blokují všechny dráhy 1 až 4.
// Samotné blokování slotů řeší rezervace-events-block.js.
// =========================================================

import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// =========================================================
// DOM: přihlášení
// =========================================================

const loginBox = document.getElementById("loginBox");
const appBox = document.getElementById("appBox");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginMsg = document.getElementById("loginMsg");

// =========================================================
// DOM: způsob zadávání termínu
//
// Tyto nové prvky doplníme do admin-akce.html:
// - evDateMode
// - singleDateWrap
// - multiDateWrap
// - evMonth
// - evDaysGrid
// - selectedDaysInfo
// - btnSelectAllDays
// - btnClearDays
// - tlačítka s atributem data-weekday
// =========================================================

const evDateMode = document.getElementById("evDateMode");
const singleDateWrap = document.getElementById("singleDateWrap");
const multiDateWrap = document.getElementById("multiDateWrap");

const evDate = document.getElementById("evDate");
const evMonth = document.getElementById("evMonth");
const evDaysGrid = document.getElementById("evDaysGrid");
const selectedDaysInfo = document.getElementById("selectedDaysInfo");

const btnSelectAllDays = document.getElementById("btnSelectAllDays");
const btnClearDays = document.getElementById("btnClearDays");

// =========================================================
// DOM: formulář akce
// =========================================================

const evStart = document.getElementById("evStart");
const evEnd = document.getElementById("evEnd");
const evType = document.getElementById("evType");

const evTeamWrap = document.getElementById("evTeamWrap");
const evTeam = document.getElementById("evTeam");

const evTitleWrap = document.getElementById("evTitleWrap");
const evTitle = document.getElementById("evTitle");

const evNote = document.getElementById("evNote");
const btnSaveEvent = document.getElementById("btnSaveEvent");
const evMsg = document.getElementById("evMsg");

// =========================================================
// DOM: seznam uložených akcí
// =========================================================

const btnLoadEvents = document.getElementById("btnLoadEvents");
const eventsList = document.getElementById("eventsList");

// =========================================================
// Stav výběru více dnů
//
// Set zajistí, že jeden den nebude vybraný vícekrát.
// Hodnoty jsou ve formátu YYYY-MM-DD.
// =========================================================

const selectedDates = new Set();

// =========================================================
// Základní UI pomocné funkce
// =========================================================

function setLoginMsg(text) {
  if (loginMsg) {
    loginMsg.textContent = text || "";
  }
}

function setEvMsg(text) {
  if (evMsg) {
    evMsg.textContent = text || "";
  }
}

function showApp(isLoggedIn) {
  if (loginBox) {
    loginBox.style.display = isLoggedIn ? "none" : "";
  }

  if (appBox) {
    appBox.style.display = isLoggedIn ? "" : "none";
  }
}

// Administraci ihned schováme, aby se před inicializací
// Firebase Authentication krátce nezobrazila.
showApp(false);

// =========================================================
// Bezpečné vložení textu do HTML
// =========================================================

function escapeHtml(value) {
  return (value ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================================================
// Pomocné funkce pro datum
// =========================================================

function pad2(number) {
  return String(number).padStart(2, "0");
}

function localDateToIso(date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());

  return `${year}-${month}-${day}`;
}

function formatDate(isoDate) {
  if (!isoDate) {
    return "";
  }

  const parts = isoDate.split("-");

  if (parts.length !== 3) {
    return isoDate;
  }

  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
}

function getCurrentMonthValue() {
  const today = new Date();
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;
}

function getDaysInMonth(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue || "")) {
    return [];
  }

  const [year, month] = monthValue.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return [];
  }

  const lastDay = new Date(year, month, 0).getDate();
  const dates = [];

  for (let day = 1; day <= lastDay; day++) {
    dates.push(new Date(year, month - 1, day));
  }

  return dates;
}

// =========================================================
// Pomocné funkce pro čas
// =========================================================

function timeToMinutes(time) {
  const match = (time || "").match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes, allowEndOfDay = false) {
  // Konec přesně ve 24:00 ukládáme jako 00:00.
  // Stávající systém tuto hodnotu již používá.
  if (allowEndOfDay && totalMinutes === 24 * 60) {
    return "00:00";
  }

  const normalized =
    ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);

  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${pad2(hours)}:${pad2(minutes)}`;
}

function computeBlockWindow(start, end) {
  // Skutečné časy start/end zůstávají zachované pro Aktuality.
  // Pro rezervace zaokrouhlujeme:
  // - začátek dolů na celou hodinu,
  // - konec nahoru na celou hodinu.

  const startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  // Čas 00:00 na konci akce znamená půlnoc následujícího dne.
  if (end === "00:00") {
    endMinutes = 24 * 60;
  }

  if (endMinutes <= startMinutes) {
    return null;
  }

  const blockStartMinutes =
    Math.floor(startMinutes / 60) * 60;

  const blockEndMinutes =
    endMinutes % 60 === 0
      ? endMinutes
      : Math.ceil(endMinutes / 60) * 60;

  return {
    blockStart: minutesToTime(blockStartMinutes),
    blockEnd: minutesToTime(blockEndMinutes, true)
  };
}

// =========================================================
// Vytvoření bezpečné části ID dokumentu
// =========================================================

function slug(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "akce";
}

function makeEventId({ date, start, type, team, title }) {
  const startPart = (start || "").replace(":", "");

  if (type === "match") {
    return `${date}_${startPart}_match_${team}`;
  }

  return `${date}_${startPart}_tournament_${slug(title)}`;
}

// =========================================================
// Přepínání formuláře podle typu akce
// =========================================================

function updateTypeUI() {
  const type = evType?.value || "match";

  if (type === "match") {
    if (evTeamWrap) {
      evTeamWrap.style.display = "";
    }

    if (evTitleWrap) {
      evTitleWrap.style.display = "none";
    }
  } else {
    if (evTeamWrap) {
      evTeamWrap.style.display = "none";
    }

    if (evTitleWrap) {
      evTitleWrap.style.display = "";
    }
  }
}

evType?.addEventListener("change", updateTypeUI);
updateTypeUI();

// =========================================================
// Přepínání mezi jedním dnem a více dny
// =========================================================

function getDateMode() {
  return evDateMode?.value === "multiple"
    ? "multiple"
    : "single";
}

function updateDateModeUI() {
  const mode = getDateMode();

  if (singleDateWrap) {
    singleDateWrap.style.display =
      mode === "single" ? "" : "none";
  }

  if (multiDateWrap) {
    multiDateWrap.style.display =
      mode === "multiple" ? "" : "none";
  }

  if (btnSaveEvent) {
    btnSaveEvent.textContent =
      mode === "multiple"
        ? "Uložit vybrané dny"
        : "Uložit akci";
  }

  if (mode === "multiple") {
    if (evMonth && !evMonth.value) {
      evMonth.value = getCurrentMonthValue();
    }

    renderMonthDays();
  }
}

evDateMode?.addEventListener("change", updateDateModeUI);

// =========================================================
// Výběr dnů v měsíci
// =========================================================

function updateSelectedDaysInfo() {
  if (!selectedDaysInfo) {
    return;
  }

  const dates = Array.from(selectedDates).sort();

  if (dates.length === 0) {
    selectedDaysInfo.textContent = "Není vybraný žádný den.";
    return;
  }

  selectedDaysInfo.textContent =
    `Vybráno dnů: ${dates.length} | ` +
    dates.map(formatDate).join(", ");
}

function updateDayButtonState(button, isSelected) {
  button.classList.toggle("selected", isSelected);
  button.setAttribute("aria-pressed", String(isSelected));

  if (isSelected) {
    button.style.background = "#ffd700";
    button.style.color = "#1e235c";
    button.style.borderColor = "#ffd700";
    button.style.fontWeight = "700";
  } else {
    button.style.background = "";
    button.style.color = "";
    button.style.borderColor = "";
    button.style.fontWeight = "";
  }
}

function syncDayButtons() {
  if (!evDaysGrid) {
    return;
  }

  evDaysGrid
    .querySelectorAll("button[data-date]")
    .forEach((button) => {
      const date = button.dataset.date || "";
      updateDayButtonState(button, selectedDates.has(date));
    });

  updateSelectedDaysInfo();
}

function toggleSelectedDate(date) {
  if (selectedDates.has(date)) {
    selectedDates.delete(date);
  } else {
    selectedDates.add(date);
  }

  syncDayButtons();
}

function renderMonthDays() {
  if (!evDaysGrid || !evMonth) {
    return;
  }

  const monthValue = evMonth.value;

  if (!monthValue) {
    evDaysGrid.innerHTML =
      "<p><em>Nejdříve vyber měsíc.</em></p>";
    return;
  }

  // Při změně měsíce vyčistíme starý výběr.
  selectedDates.clear();

  const days = getDaysInMonth(monthValue);

  if (days.length === 0) {
    evDaysGrid.innerHTML =
      "<p><em>Vybraný měsíc není platný.</em></p>";
    updateSelectedDaysInfo();
    return;
  }

  const weekdayNames = [
    "Ne",
    "Po",
    "Út",
    "St",
    "Čt",
    "Pá",
    "So"
  ];

  evDaysGrid.innerHTML = days.map((date) => {
    const isoDate = localDateToIso(date);
    const dayNumber = date.getDate();
    const weekday = weekdayNames[date.getDay()];

    return `
      <button
        type="button"
        class="btn-soft month-day-button"
        data-date="${isoDate}"
        data-weekday="${date.getDay()}"
        aria-pressed="false"
        style="min-width:74px; padding:8px 10px;"
      >
        ${dayNumber}. ${weekday}
      </button>
    `;
  }).join("");

  evDaysGrid
    .querySelectorAll("button[data-date]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        toggleSelectedDate(button.dataset.date || "");
      });
    });

  updateSelectedDaysInfo();
}

evMonth?.addEventListener("change", renderMonthDays);

// =========================================================
// Hromadný výběr dnů
// =========================================================

btnSelectAllDays?.addEventListener("click", () => {
  if (!evDaysGrid) {
    return;
  }

  evDaysGrid
    .querySelectorAll("button[data-date]")
    .forEach((button) => {
      const date = button.dataset.date;

      if (date) {
        selectedDates.add(date);
      }
    });

  syncDayButtons();
});

btnClearDays?.addEventListener("click", () => {
  selectedDates.clear();
  syncDayButtons();
});

// Vybere všechny dny určitého dne v týdnu.
// Hodnoty JavaScript Date.getDay():
// 0 = neděle, 1 = pondělí, ..., 6 = sobota.
document
  .querySelectorAll("button[data-select-weekday]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      if (!evDaysGrid) {
        return;
      }

      const weekday =
        Number(button.dataset.selectWeekday);

      evDaysGrid
        .querySelectorAll("button[data-date]")
        .forEach((dayButton) => {
          const dayWeekday =
            Number(dayButton.dataset.weekday);

          const date = dayButton.dataset.date;

          if (
            dayWeekday === weekday &&
            date
          ) {
            selectedDates.add(date);
          }
        });

      syncDayButtons();
    });
  });

// =========================================================
// Firebase Authentication
// =========================================================

btnLogin?.addEventListener("click", async () => {
  const email = (emailEl?.value || "").trim();
  const password = passEl?.value || "";

  if (!email || !password) {
    setLoginMsg("⚠️ Zadej email i heslo.");
    return;
  }

  try {
    setLoginMsg("⏳ Přihlašuji…");

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    setLoginMsg("✅ Přihlášeno.");
  } catch (error) {
    console.error(error);
    setLoginMsg(
      "❌ Přihlášení se nepovedlo. Zkontroluj email a heslo."
    );
  }
});

btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
  }
});

onAuthStateChanged(auth, (user) => {
  showApp(Boolean(user));

  if (user) {
    loadEvents();
  } else {
    setLoginMsg("");
  }
});

// =========================================================
// Načtení společných hodnot formuláře
// =========================================================

function readEventForm() {
  const start = (evStart?.value || "").trim();
  const end = (evEnd?.value || "").trim();
  const type = evType?.value || "match";
  const note = (evNote?.value || "").trim() || null;

  if (!start || !end) {
    return {
      ok: false,
      message: "⚠️ Vyplň čas Od a Do."
    };
  }

  const blockWindow =
    computeBlockWindow(start, end);

  if (!blockWindow) {
    return {
      ok: false,
      message:
        "⚠️ Čas nemá platný formát nebo konec není po začátku."
    };
  }

  let team = null;
  let title = null;

  if (type === "match") {
    team = evTeam?.value || "A";
  } else {
    title = (evTitle?.value || "").trim();

    if (!title) {
      return {
        ok: false,
        message: "⚠️ U turnaje vyplň název."
      };
    }
  }

  return {
    ok: true,
    start,
    end,
    blockStart: blockWindow.blockStart,
    blockEnd: blockWindow.blockEnd,
    type,
    team,
    title,
    note
  };
}

function getSelectedFormDates() {
  if (getDateMode() === "multiple") {
    return Array
      .from(selectedDates)
      .sort();
  }

  const date = (evDate?.value || "").trim();
  return date ? [date] : [];
}

// =========================================================
// Uložení jedné akce
//
// Vrací:
// - "saved"   nově uloženo
// - "skipped" dokument již existoval
// =========================================================

async function saveSingleEvent(date, formData) {
  const eventId = makeEventId({
    date,
    start: formData.start,
    type: formData.type,
    team: formData.team,
    title: formData.title
  });

  const reference = doc(
    db,
    "events",
    eventId
  );

  const snapshot = await getDoc(reference);

  if (snapshot.exists()) {
    return {
      status: "skipped",
      date
    };
  }

  await setDoc(reference, {
    date,
    start: formData.start,
    end: formData.end,
    blockStart: formData.blockStart,
    blockEnd: formData.blockEnd,
    type: formData.type,
    team: formData.team,
    title: formData.title,
    note: formData.note,
    createdAt: new Date().toISOString()
  });

  return {
    status: "saved",
    date
  };
}

// =========================================================
// Uložení jednoho nebo více dnů
// =========================================================

btnSaveEvent?.addEventListener("click", async () => {
  setEvMsg("");

  if (!auth.currentUser) {
    setEvMsg("⚠️ Nejprve se přihlas.");
    return;
  }

  const dates = getSelectedFormDates();

  if (dates.length === 0) {
    setEvMsg(
      getDateMode() === "multiple"
        ? "⚠️ Vyber alespoň jeden den v měsíci."
        : "⚠️ Vyplň datum."
    );
    return;
  }

  const formData = readEventForm();

  if (!formData.ok) {
    setEvMsg(formData.message);
    return;
  }

  const eventName =
    formData.type === "match"
      ? `Zápas ${formData.team}`
      : formData.title;

  const dateList =
    dates.map(formatDate).join("\n");

  const confirmText =
    `Uložit ${dates.length} akci/akcí?\n\n` +
    `${eventName}\n` +
    `Skutečný čas: ${formData.start}–${formData.end}\n` +
    `Blokace drah: ${formData.blockStart}–${formData.blockEnd}\n\n` +
    `Termíny:\n${dateList}`;

  if (!confirm(confirmText)) {
    return;
  }

  const oldButtonText =
    btnSaveEvent?.textContent || "Uložit akci";

  if (btnSaveEvent) {
    btnSaveEvent.disabled = true;
    btnSaveEvent.textContent = "Ukládám…";
  }

  setEvMsg(
    `⏳ Ukládám ${dates.length} akci/akcí…`
  );

  let savedCount = 0;
  let skippedCount = 0;
  const failedDates = [];

  try {
    // Ukládáme postupně, aby byl přehledný výsledek
    // a abychom mohli jednotlivé duplicity přeskočit.
    for (const date of dates) {
      try {
        const result =
          await saveSingleEvent(
            date,
            formData
          );

        if (result.status === "saved") {
          savedCount += 1;
        } else {
          skippedCount += 1;
        }
      } catch (error) {
        console.error(
          `Chyba při ukládání ${date}:`,
          error
        );

        failedDates.push(date);
      }
    }

    let message =
      `✅ Uloženo: ${savedCount}. ` +
      `Přeskočeno: ${skippedCount}.`;

    if (failedDates.length > 0) {
      message +=
        ` Chyby: ${failedDates.length} ` +
        `(${failedDates
          .map(formatDate)
          .join(", ")}).`;
    }

    setEvMsg(message);

    await loadEvents();
  } catch (error) {
    console.error(error);
    setEvMsg(
      "❌ Hromadné ukládání selhalo. Zkontroluj Firestore Rules."
    );
  } finally {
    if (btnSaveEvent) {
      btnSaveEvent.disabled = false;
      btnSaveEvent.textContent = oldButtonText;
    }
  }
});

// =========================================================
// Načtení a vykreslení existujících akcí
// =========================================================

async function loadEvents() {
  if (!eventsList) {
    return;
  }

  eventsList.innerHTML =
    "<p><em>Načítám…</em></p>";

  try {
    const eventsQuery = query(
      collection(db, "events"),
      orderBy("date"),
      orderBy("start")
    );

    const snapshot =
      await getDocs(eventsQuery);

    const items = snapshot.docs.map(
      (eventDocument) => ({
        id: eventDocument.id,
        ...eventDocument.data()
      })
    );

    if (items.length === 0) {
      eventsList.innerHTML =
        "<p><em>Zatím nejsou uložené žádné akce.</em></p>";
      return;
    }

    const html = items.map((event) => {
      const label =
        event.type === "match"
          ? `Zápas ${event.team || ""}`
          : event.title || "Turnaj";

      return `
        <div class="rowline">
          <div>
            <strong>${escapeHtml(formatDate(event.date))}</strong>
            ${escapeHtml(event.start || "")}–${escapeHtml(event.end || "")}

            <span
              class="small"
              style="margin-left:8px; opacity:0.85;"
            >
              (blokace:
              ${escapeHtml(event.blockStart || "")}–${escapeHtml(event.blockEnd || "")})
            </span>

            <div
              class="small"
              style="margin-top:4px;"
            >
              <strong>${escapeHtml(label)}</strong>

              ${
                event.note
                  ? ` — ${escapeHtml(event.note)}`
                  : ""
              }
            </div>
          </div>

          <div>
            <button
              class="btn-danger"
              type="button"
              data-delete-event="${escapeHtml(event.id)}"
            >
              Smazat
            </button>
          </div>
        </div>
      `;
    }).join("");

    eventsList.innerHTML = html;

    // Napojení tlačítek pro mazání jednotlivých akcí.
    eventsList
      .querySelectorAll(
        "button[data-delete-event]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const id =
              button.getAttribute(
                "data-delete-event"
              );

            if (!id) {
              return;
            }

            if (
              !confirm(
                "Opravdu smazat tuto akci?"
              )
            ) {
              return;
            }

            try {
              button.disabled = true;
              button.textContent = "Mažu…";

              await deleteDoc(
                doc(db, "events", id)
              );

              await loadEvents();
            } catch (error) {
              console.error(error);
              button.disabled = false;
              button.textContent = "Smazat";

              alert(
                "Nepodařilo se smazat akci."
              );
            }
          }
        );
      });
  } catch (error) {
    console.error(error);

    eventsList.innerHTML =
      "<p><em>Nelze načíst akce. Zkontroluj Firestore Rules pro events.</em></p>";
  }
}

btnLoadEvents?.addEventListener(
  "click",
  loadEvents
);

// =========================================================
// Počáteční nastavení formuláře
// =========================================================

if (evMonth && !evMonth.value) {
  evMonth.value = getCurrentMonthValue();
}

updateDateModeUI();
