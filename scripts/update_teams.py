import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urljoin

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
# Nový výsledkový servis: rozpis a výsledky zápasů
# ============================================================

def team_matches(name: str, team_key: str) -> bool:
    """Porovnání názvu týmu tolerantní k tečce a prefixu TJ Sokol."""
    value = norm(name).rstrip(".").casefold()
    key = norm(team_key).rstrip(".").casefold()
    return value == key or key in value


def parse_match_cards(soup: BeautifulSoup, team_key: str) -> List[Dict[str, Any]]:
    """
    Načte zápasy z odkazů /detail-zapasu/ na nové stránce soutěže.

    Výstup obsahuje: round, date, time, home, away, result, pins,
    played a url. Když servis ještě výsledek nepublikoval, result/pins
    zůstanou prázdné a zápas se zařadí mezi budoucí.
    """
    output: List[Dict[str, Any]] = []
    seen_urls = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "")
        if "/detail-zapasu/" not in href:
            continue

        absolute_url = urljoin("https://vysledky.kuzelky.cz", href)
        if absolute_url in seen_urls:
            continue
        seen_urls.add(absolute_url)

        # Nový servis obvykle ukládá celé utkání do textu odkazu.
        # Když je text odkazu stručný, hledáme nejbližší rodičovský blok.
        candidates = [anchor]
        parent = anchor.parent
        for _ in range(5):
            if parent is None:
                break
            candidates.append(parent)
            parent = parent.parent

        card_text = ""
        for candidate in candidates:
            text = norm(candidate.get_text(" ", strip=True))
            if DT_RE.search(text) and team_key.casefold() in text.casefold():
                card_text = text
                if len(text) < 500:
                    break

        if not card_text:
            continue

        date_string, time_string, parsed_dt = parse_dt(card_text)
        if not date_string:
            continue

        round_match = re.search(r"(?:^|\D)kolo[-\s]?(\d+)(?:\D|$)", href, re.I)
        round_number = int(round_match.group(1)) if round_match else None

        # Text za datem/časem obvykle vypadá:
        # Domácí – výsledek – Hosté, případně Domácí – – Hosté.
        after_dt = DT_RE.sub("", card_text, count=1).strip(" |–-")
        parts = [norm(x).strip() for x in re.split(r"\s+[–—]\s+", after_dt) if norm(x)]

        home_name = ""
        away_name = ""
        middle = ""

        if len(parts) >= 3:
            home_name = parts[0]
            away_name = parts[-1]
            middle = " | ".join(parts[1:-1])
        else:
            # Náhradní varianta pro obyčejný spojovník.
            parts = [norm(x).strip() for x in re.split(r"\s+-\s+", after_dt) if norm(x)]
            if len(parts) >= 3:
                home_name = parts[0]
                away_name = parts[-1]
                middle = " | ".join(parts[1:-1])

        # Některé karty mají před domácím ještě pořadové číslo.
        home_name = re.sub(r"^\d+\s+", "", home_name).rstrip(".")
        away_name = away_name.rstrip(".")

        if not home_name or not away_name:
            continue
        if not (team_matches(home_name, team_key) or team_matches(away_name, team_key)):
            continue

        score_match = re.search(r"(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)", middle)
        pins_match = re.search(r"(\d{3,4})\s*:\s*(\d{3,4})", card_text)

        result = None
        if score_match:
            result = f"{score_match.group(1)}:{score_match.group(2)}"

        pins = None
        if pins_match:
            pins = f"{pins_match.group(1)}:{pins_match.group(2)}"

        played = bool(result and result.replace(" ", "") != "0:0") or bool(
            pins and pins.replace(" ", "") != "0:0"
        )

        output.append({
            "round": round_number,
            "date": date_string,
            "time": time_string,
            "dt": parsed_dt,
            "home": home_name,
            "away": away_name,
            "result": result,
            "pins": pins,
            "played": played,
            "url": absolute_url
        })

    # Odstranění případných duplicit a seřazení chronologicky.
    unique: Dict[str, Dict[str, Any]] = {}
    for item in output:
        key = item["url"]
        unique[key] = item

    return sorted(
        unique.values(),
        key=lambda item: item.get("dt") or datetime.max.replace(tzinfo=timezone.utc)
    )


def public_match(item: Dict[str, Any]) -> Dict[str, Any]:
    """Odstraní interní datetime, který nelze uložit do JSON."""
    return {
        "round": item.get("round"),
        "date": item.get("date"),
        "time": item.get("time"),
        "home": item.get("home"),
        "away": item.get("away"),
        "result": item.get("result"),
        "pins": item.get("pins"),
        "url": item.get("url")
    }

# ============================================================
# Datová třída zápasu
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
    """Načte tabulku, budoucí i minulé zápasy družstva."""
   html = fetch(competition_url)
soup = BeautifulSoup(html, "lxml")

# ============================================================
# Diagnostika nového výsledkového servisu
# Do logu GitHub Actions vypíše, co server skutečně poslal.
# ============================================================

all_links = [
    anchor.get("href", "")
    for anchor in soup.find_all("a", href=True)
]

match_links = [
    href
    for href in all_links
    if "detail-zapasu" in href
]

print(f"DEBUG {team_id}: HTML length = {len(html)}")
print(f"DEBUG {team_id}: tables = {len(soup.find_all('table'))}")
print(f"DEBUG {team_id}: all links = {len(all_links)}")
print(f"DEBUG {team_id}: match links = {len(match_links)}")
print(f"DEBUG {team_id}: scripts = {len(soup.find_all('script'))}")

# Vypíšeme několik odkazů na zápasy, pokud jsou ve zdrojovém HTML.
for href in match_links[:5]:
    print(f"DEBUG {team_id}: match URL = {href}")

# Zjistíme, zda stránka obsahuje data frameworku Next.js.
next_data = soup.find("script", id="__NEXT_DATA__")
print(
    f"DEBUG {team_id}: __NEXT_DATA__ = "
    f"{'YES' if next_data else 'NO'}"
)

# Zjistíme, zda jsou v HTML zmíněné možné API adresy.
html_lower = html.lower()

for keyword in [
    "/api/",
    "graphql",
    "detail-zapasu",
    "benesov",
    "benešov"
]:
    print(
        f"DEBUG {team_id}: contains {keyword} = "
        f"{keyword in html_lower}"
    )

table = parse_table(soup)
all_matches = parse_match_cards(soup, team_key)
    past_matches = [public_match(m) for m in all_matches if m["played"]]
    future_matches = [public_match(m) for m in all_matches if not m["played"]]

    now = datetime.now(timezone.utc)
    completed = [m for m in all_matches if m["played"] and m.get("dt")]
    upcoming = [m for m in all_matches if not m["played"] and m.get("dt") and m["dt"] >= now]

    last_match = public_match(completed[-1]) if completed else None
    next_match = public_match(upcoming[0]) if upcoming else None

    path = BASE / f"{team_id}.json"
    data = load_json(path) if path.exists() else {}

    # Prázdná odpověď nesmí přepsat dříve platnou tabulku.
    if table.get("columns") and table.get("rows"):
        data["table"] = table
        table_status = "updated"
    elif data.get("table", {}).get("rows"):
        table_status = "kept_previous"
    else:
        data["table"] = table
        table_status = "empty"

    data["label"] = label
    data["source"] = {
        "type": "cka",
        "url": competition_url,
        "teamKey": team_key
    }
    data["updatedAt"] = iso_now()
    data["lastMatch"] = last_match
    data["nextMatch"] = next_match
    data["futureMatches"] = future_matches
    data["pastMatches"] = past_matches
    data["tableStatus"] = table_status
    data["debug"] = {
        "matchesFound": len(all_matches),
        "playedCount": len(past_matches),
        "futureCount": len(future_matches),
        "teamKey": team_key,
        "competitionUrl": competition_url,
        "sample": [public_match(m) for m in all_matches[:3]]
    }

    save_json(path, data)
    print(
        f"OK: {team_id}: table={table_status}, "
        f"past={len(past_matches)}, future={len(future_matches)}"
    )


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
