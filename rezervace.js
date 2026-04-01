
import { BASE_URL } from "./config.js";
import { db } from "./firebase-config.js";
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ---------------------------
// GENERÁTOR KÓDU (6 znaků)
// ---------------------------
function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ---------------------------
// QR KÓD
// ---------------------------
function generateQR(text) {
    const qr = new QRCode({
        content: text,
        width: 200,
        height: 200,
        padding: 1
    });
    return qr.svg();
}

// ---------------------------
// NAČTENÍ OBSazených SLOTŮ
// ---------------------------
async function getReservedSlots(date) {
    const q = query(
        collection(db, "reservations"),
        where("date", "==", date)
    );

    const snapshot = await getDocs(q);
    const result = {};

    snapshot.forEach(doc => {
        const r = doc.data();
        if (!result[r.lane]) result[r.lane] = [];
        result[r.lane].push({
            start: r.start,
            end: r.end
        });
    });

    return result;
}

// ---------------------------
// GENEROVÁNÍ SLOTŮ 08:00–21:00
// ---------------------------
function generateHourlySlots() {
    const slots = [];
    for (let h = 8; h < 21; h++) {
        const s = h.toString().padStart(2, "0") + ":00";
        slots.push(s);
    }
    return slots;
}

// ---------------------------
// ODESLÁNÍ REZERVACE
// ---------------------------
async function saveReservation(date, lane, start, end, name, note) {
    const code = generateCode(); // unikátní kód
    const reservation = {
        id: code,
        date: date,
        lane: lane,
        start: start,
        end: end,
        name: name,
        note: note || "",
        createdAt: Timestamp.now()
    };

    await addDoc(collection(db, "reservations"), reservation);
    return reservation;
}

// ---------------------------
// OVĚŘENÍ, ZDA SE SLOT NEKRYJE
// start = "10:00", hours = 2 → end = "12:00"
// ---------------------------
function isSlotFree(reserved, lane, start, hours) {
    const startHour = parseInt(start.split(":")[0]);
    const endHour = startHour + hours;

    const checkStart = startHour + ":00";
    const checkEnd = endHour + ":00";

    if (!reserved[lane]) return true;

    for (const r of reserved[lane]) {
        const resStart = parseInt(r.start.split(":")[0]);
        const resEnd = parseInt(r.end.split(":")[0]);

        // kolize
        if (!(endHour <= resStart || startHour >= resEnd)) {
            return false;
        }
    }
    return true;
}

// ---------------------------
// VYTVOŘENÍ REZERVACE PO KLIKUTÍ NA SLOT
// ---------------------------
async function handleSlotClick(date, lane, start) {
    const name = prompt("Zadejte jméno:");

    if (!name || name.trim().length < 2) {
        alert("Musíte zadat jméno.");
        return;
    }

    const hours = parseInt(prompt("Počet hodin (1–3):"));

    if (![1,2,3].includes(hours)) {
        alert("Neplatný počet hodin.");
        return;
    }

    let note = prompt("Poznámka (volitelné):") || "";

    // načíst obsazené termíny
    const reserved = await getReservedSlots(date);

    // zkontrolovat dostupnost
    if (!isSlotFree(reserved, lane, start, hours)) {
        alert("Vybraný termín je již obsazený.");
        return;
    }

    // vypočítat koncový čas
    const startHour = parseInt(start.split(":")[0]);
    const end = (startHour + hours).toString().padStart(2, "0") + ":00";

    // uložit rezervaci
    const reservation = await saveReservation(date, lane, start, end, name, note);

    // zobrazit výsledek
    showReservationResult(reservation);
}



// ---------------------------
// VYKRESLENÍ SLOTŮ PRO DANÝ DEN
// ---------------------------
async function renderSlots(date) {
    const lanesDiv = document.getElementById("lanes");
    lanesDiv.innerHTML = ""; // vymazat

    if (!date) return;

    // načíst obsazené sloty
    const reserved = await getReservedSlots(date);
    const slots = generateHourlySlots();

    // 4 dráhy
    for (let lane = 1; lane <= 4; lane++) {
        const laneBox = document.createElement("div");
        laneBox.className = "lane-box";

        const title = document.createElement("h3");
        title.textContent = `Dráha ${lane}`;
        laneBox.appendChild(title);

        // vykreslení hodin
        for (const start of slots) {
            const btn = document.createElement("button");
            btn.textContent = start;
            btn.className = "slot-btn";

            // je slot obsazený?
            let isBusy = false;

            if (reserved[lane]) {
                for (const r of reserved[lane]) {
                    const startH = parseInt(start.split(":")[0]);
                    const resStart = parseInt(r.start.split(":")[0]);
                    const resEnd = parseInt(r.end.split(":")[0]);

                    if (startH >= resStart && startH < resEnd) {
                        isBusy = true;
                        break;
                    }
                }
            }

            if (isBusy) {
                btn.classList.add("busy");
                btn.disabled = true;
            } else {
                btn.classList.add("free");
                btn.addEventListener("click", () => handleSlotClick(date, lane, start));
            }

            laneBox.appendChild(btn);
        }

        lanesDiv.appendChild(laneBox);
    }
}

// ---------------------------
// AKTIVACE PŘI ZMĚNĚ DATUMU
// ---------------------------
document.getElementById("date").addEventListener("change", (e) => {
    const date = e.target.value;
    renderSlots(date);
});

// ---------------------------
// AUTO-START (pokud má input hodnotu)
// ---------------------------
window.addEventListener("load", () => {
    const dateInput = document.getElementById("date");
    if (dateInput.value) {
        renderSlots(dateInput.value);
    }
});
