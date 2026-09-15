import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import requests
from bs4 import BeautifulSoup


# ============================================================
# Základní nastavení
# ============================================================

BASE = Path("data/teams")
BASE.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "kuzelky-benesov-bot/1.0 "
        "(+https://xprom115-rgb.github.io/kuzelky-benesov/)"
    )
}


# ============================================================
# A/B/C – nový výsledkový servis ČKA pro sezonu 2026/2027
# ============================================================

COMPETITIONS = {
    "A": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/3-klm-a-2026-2027",
        "teamKey": "Benešov",
        "label": "Družstvo A – 3. KLM A"
    },
    "B": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/divize-as-2026-2027",
        "teamKey": "Benešov B",
        "label": "Družstvo B – Divize AS"
    },
    "C": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/krajsky-prebor-1-tridy-2026-2027",
        "teamKey": "Benešov C",
        "label": "Družstvo C – Krajský přebor 1. třídy"
    }
}

# Dorost se v main() nyní neaktualizuje. Konstanta zůstává připravena.
SKKS_DOROST_URL = (
    "https://www.skks-kuzelky.cz/index.php/souteze/"
    "stredocesky-pohar-mladeze"
)


# ============================================================
# Obecné pomocné funkce
# ============================================================

def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(
        json.dumps(obj, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fetch(url: str) -> str:
    """Stáhne stránku. Při dočasném selhání provede až tři pokusy."""
    last_error: Optional[Exception] = None

    for attempt in range(1, 4):
        try:
            response = requests.get(
                url,
                headers=HEADERS,
                timeout=(20, 60)
            )
            response.raise_for_status()
            return response.text
        except Exception as error:
            last_error = error
            time.sleep(attempt)

    if last_error is not None:
        raise last_error

    raise RuntimeError(f"Nepodařilo se stáhnout URL: {url}")


def norm(value: str) -> str:
    return " ".join(
        (value or "").replace("\xa0", " ").split()
    ).strip()


# ============================================================
# Datum a čas
# ============================================================

DT_RE = re.compile(
    r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})"
    r"(?:\s+(\d{1,2})[.:](\d{2}))?"
)


def parse_dt(
    text: str
) -> Tuple[Optional[str], Optional[str], Optional[datetime]]:
    normalized = norm(text)
    match = DT_RE.search(normalized)

    if not match:
        return None, None, None

    day = int(match.group(1))
    month = int(match.group(2))
    year = int(match.group(3))
    hour = match.group(4)
    minute = match.group(5)

    date_string = f"{year:04d}-{month:02d}-{day:02d}"

    if hour is not None and minute is not None:
        time_string = f"{int(hour):02d}:{int(minute):02d}"
        parsed_datetime = datetime(
            year,
            month,
            day,
            int(hour),
            int(minute),
            tzinfo=timezone.utc
        )
    else:
        time_string = None
        parsed_datetime = datetime(
            year,
            month,
            day,
            0,
            0,
            tzinfo=timezone.utc
        )

    return date_string, time_string, parsed_datetime


# ============================================================
# Celková tabulka soutěže
# ============================================================

def parse_table(soup: BeautifulSoup) -> Dict[str, Any]:
    """
    Načte soutěžní tabulku ze starého i nového servisu.

    Podporuje názvy sloupce „Družstvo“ i „Tým“.
    """
    target = None

    for table in soup.find_all("table"):
        text = norm(table.get_text(" ", strip=True))

        has_team_column = "Družstvo" in text or "Tým" in text
        has_score_column = "Skóre" in text or "SB" in text
        has_points_column = (
            "Body" in text or re.search(r"\bB\b", text) is not None
        )

        if has_team_column and has_score_column and has_points_column:
            target = table
            break

    if target is None:
        return {"columns": [], "rows": []}

    table_rows = target.find_all("tr")
    if not table_rows:
        return {"columns": [], "rows": []}

    header_cells = table_rows[0].find_all(["th", "td"])
    columns = [
        norm(cell.get_text(" ", strip=True))
        for cell in header_cells
    ]

    if not columns:
        return {"columns": [], "rows": []}

    rows_out: List[List[str]] = []

    for row_element in table_rows[1:]:
        cells = row_element.find_all(["td", "th"])
        if not cells:
            continue

        row = [
            norm(cell.get_text(" ", strip=True))
            for cell in cells
        ]

        if not any(row):
            continue

        if len(row) < len(columns):
            row.extend([""] * (len(columns) - len(row)))

        if len(row) > len(columns):
            row = row[:len(columns)]

        rows_out.append(row)

    return {"columns": columns, "rows": rows_out}


# ============================================================
# Datová třída zápasu
#
# Zůstává připravena pro další krok, ve kterém se doplní parser
# nových odkazů /detail-zapasu/.
# ============================================================

@dataclass
class Match:
    date: Optional[str]
    time: Optional[str]
    dt: Optional[datetime]
    home: Optional[bool]
    opponent: str
    score: Optional[str]
    pins: Optional[str]
    played: bool


def pick_last_next(
    matches: List[Match]
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    now = datetime.now(timezone.utc)

    played = [
        match for match in matches
        if match.played and match.dt is not None
    ]
    future = [
        match for match in matches
        if not match.played and match.dt is not None
    ]

    played.sort(key=lambda match: match.dt)
    future.sort(key=lambda match: match.dt)

    last = played[-1] if played else None
    next_match = next(
        (match for match in future if match.dt >= now),
        future[0] if future else None
    )

    def to_dict(match: Match) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "date": match.date,
            "time": match.time,
            "home": match.home,
            "opponent": match.opponent
        }

        if match.score:
            result["score"] = match.score

        if match.pins:
            result["pins"] = match.pins

        return result

    return (
        to_dict(last) if last else None,
        to_dict(next_match) if next_match else None
    )


# ============================================================
# Aktualizace A/B/C
# ============================================================

def update_cka_team(
    team_id: str,
    competition_url: str,
    team_key: str,
    label: str
) -> None:
    # Nová adresa soutěže se předává přímo z COMPETITIONS.
    base_url = competition_url

    # Načtení hlavní stránky soutěže.
    html = fetch(base_url)
    soup = BeautifulSoup(html, "lxml")

    # Načtení celkové tabulky soutěže.
    table = parse_table(soup)

    # Nový výsledkový servis už nepoužívá parametr ?r=.
    # Načítání jednotlivých zápasů doplníme v dalším kroku.
    matches_all: List[Match] = []

    last_m = None
    next_m = None

    data_debug = {
        "matchesFound": len(matches_all),
        "playedCount": 0,
        "futureCount": 0,
        "teamKey": team_key,
        "competitionUrl": competition_url,
        "sample": []
    }

    path = BASE / f"{team_id}.json"
    data = load_json(path) if path.exists() else {}

    data["label"] = label
    data["source"] = {
        "type": "cka",
        "url": competition_url,
        "teamKey": team_key
    }
    data["updatedAt"] = iso_now()
    data["lastMatch"] = last_m
    data["nextMatch"] = next_m
if table["columns"] and table["rows"]:
    data["table"] = table
    data["tableStatus"] = "updated"
else:
    previous_table = data.get("table")

    if (
        isinstance(previous_table, dict)
        and previous_table.get("columns")
        and previous_table.get("rows")
    ):
        data["table"] = previous_table
        data["tableStatus"] = "kept_previous"
        print(
            f"WARNING: {team_id} table is empty; "
            "previous table was preserved."
        )
    else:
        data["table"] = table
        data["tableStatus"] = "empty"
        print(
            f"WARNING: {team_id} table is currently empty."
        )
    data["debug"] = data_debug

    save_json(path, data)

    print(f"OK: updated {team_id} from {base_url}")


# ============================================================
# Dorost – připravená funkce, nyní se v main() nespouští
# ============================================================

def update_dorost() -> None:
    html = fetch(SKKS_DOROST_URL)
    soup = BeautifulSoup(html, "lxml")

    bulletins: List[Dict[str, str]] = []
    seen = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        text = norm(anchor.get_text(" ", strip=True))

        if not href.lower().endswith(".pdf"):
            continue

        if "zpravodaj" not in text.lower() and "zpravodaj" not in href.lower():
            continue

        if href.startswith("/"):
            url = "https://www.skks-kuzelky.cz" + href
        elif href.startswith("http"):
            url = href
        else:
            url = "https://www.skks-kuzelky.cz/" + href.lstrip("./")

        if url in seen:
            continue

        seen.add(url)
        bulletins.append({
            "title": text if text else "Zpravodaj",
            "url": url
        })

    path = BASE / "DOROST.json"
    data = load_json(path) if path.exists() else {}

    data["label"] = data.get(
        "label",
        "Dorost – Středočeský pohár mládeže"
    )
    data["source"] = {
        "type": "skks",
        "url": SKKS_DOROST_URL
    }
    data["updatedAt"] = iso_now()
    data["bulletins"] = bulletins

    save_json(path, data)
    print("OK: updated DOROST bulletins")


# ============================================================
# Hlavní běh pro GitHub Actions
# ============================================================

def main() -> None:
    failures = 0

    for team_id, config in COMPETITIONS.items():
        try:
            update_cka_team(
                team_id,
                config["url"],
                config["teamKey"],
                config["label"]
            )
        except Exception as error:
            failures += 1
            print(f"ERROR: {team_id} failed: {error}")

    # Workflow skončí chybou pouze tehdy, pokud selžou všechny
    # tři zdroje A, B i C. Při částečném výpadku zůstanou u
    # neúspěšného týmu zachována předchozí data.
    if failures >= len(COMPETITIONS):
        raise RuntimeError("All A/B/C sources failed")


if __name__ == "__main__":
    main()
