import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import requests
from bs4 import BeautifulSoup

BASE = Path("data/teams")
BASE.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "kuzelky-benesov-bot/1.0 (+https://xprom115-rgb.github.io/kuzelky-benesov/)"
}


# ============================================================
# A/B/C – nový výsledkový servis ČKA pro sezonu 2026/2027
# Každá soutěž má vlastní adresu detail-souteze.
# teamKey musí odpovídat názvu družstva na nové stránce.
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

# Dorost – jen zpravodaje (SKKS)
SKKS_DOROST_URL = "https://www.skks-kuzelky.cz/index.php/souteze/stredocesky-pohar-mladeze"


# ---------- helpers ----------

def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def fetch(url: str) -> str:
    # Delší timeout a jednoduché retry
    last_err = None
    for attempt in range(1, 4):  # 3 pokusy
        try:
            # (connect timeout, read timeout)
            r = requests.get(url, headers=HEADERS, timeout=(20, 60))
            r.raise_for_status()
            return r.text
        except Exception as e:
            last_err = e
            # krátká pauza (1s, 2s, 3s)
            import time
            time.sleep(attempt)
    raise last_err

def norm(s: str) -> str:
    return " ".join((s or "").replace("\xa0", " ").split()).strip()


# datum/čas typu "Po 1. 12. 2025 17.00" / "So 10. 4. 2026 17.30"
DT_RE = re.compile(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2})[.:](\d{2}))?")

def parse_dt(text: str) -> Tuple[Optional[str], Optional[str], Optional[datetime]]:
    t = norm(text)
    m = DT_RE.search(t)
    if not m:
        return None, None, None
    dd = int(m.group(1))
    mm = int(m.group(2))
    yyyy = int(m.group(3))
    hh = m.group(4)
    mi = m.group(5)
    date_str = f"{yyyy:04d}-{mm:02d}-{dd:02d}"
    if hh is not None and mi is not None:
        time_str = f"{int(hh):02d}:{int(mi):02d}"
        dt = datetime(yyyy, mm, dd, int(hh), int(mi), tzinfo=timezone.utc)
    else:
        time_str = None
        dt = datetime(yyyy, mm, dd, 0, 0, tzinfo=timezone.utc)
    return date_str, time_str, dt


# ---------- parse whole table ----------

# ============================================================
# Načtení celkové tabulky soutěže
#
# Starý servis používal název sloupce "Družstvo".
# Nový servis používá název "Tým".
#
# Funkce podporuje obě varianty, aby zůstal skript použitelný
# také pro případné starší stránky výsledkového servisu.
# ============================================================

def parse_table(soup: BeautifulSoup) -> Dict[str, Any]:
    """
    Vrací celou soutěžní tabulku:

    {
        "columns": ["#", "Tým", "Z", ...],
        "rows": [
            ["1.", "Benešov B", "3", ...],
            ...
        ]
    }
    """

    target = None

    # Najdeme tabulku soutěže podle typických názvů sloupců.
    for table in soup.find_all("table"):
        text = norm(table.get_text(" ", strip=True))

        has_team_column = (
            "Družstvo" in text
            or "Tým" in text
        )

        has_score_column = (
            "Skóre" in text
            or "SB" in text
        )

        has_points_column = (
            "Body" in text
            or re.search(r"\bB\b", text) is not None
        )

        if (
            has_team_column
            and has_score_column
            and has_points_column
        ):
            target = table
            break

    if target is None:
        return {
            "columns": [],
            "rows": []
        }

    rows = target.find_all("tr")

    if not rows:
        return {
            "columns": [],
            "rows": []
        }

    # První řádek považujeme za hlavičku.
    header_cells = rows[0].find_all(["th", "td"])

    columns = [
        norm(cell.get_text(" ", strip=True))
        for cell in header_cells
    ]

    if not columns:
        return {
            "columns": [],
            "rows": []
        }

    rows_out: List[List[str]] = []

    for row_element in rows[1:]:
        cells = row_element.find_all(["td", "th"])

        if not cells:
            continue

        row = [
            norm(cell.get_text(" ", strip=True))
            for cell in cells
        ]

        # Prázdné řádky nebo řádky pomocného stránkování vynecháme.
        if not any(row):
            continue

        # Doplnění chybějících buněk.
        if len(row) < len(columns):
            row.extend(
                [""] * (len(columns) - len(row))
            )

        # Odstranění případných nadbytečných buněk.
        if len(row) > len(columns):
            row = row[:len(columns)]

        rows_out.append(row)

    return {
        "columns": columns,
        "rows": rows_out
    }

# ---------- parse matches (only Benešov) ----------

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


def find_round_numbers(soup: BeautifulSoup) -> List[int]:
    rounds = set()
    for a in soup.find_all("a", href=True):
        m = re.search(r"[?&]r=(\d+)", a["href"])
        if m:
            rounds.add(int(m.group(1)))
    return sorted(rounds)


def find_matches_table(soup: BeautifulSoup):
    for table in soup.find_all("table"):
        ths = [norm(th.get_text(" ", strip=True)) for th in table.find_all("th")]
        header = " ".join(ths)
        if ("Domácí" in header) and ("Hosté" in header):
            return table
    return None


def parse_team_matches_from_round(soup: BeautifulSoup, team_key: str) -> List[Match]:
    team_key = norm(team_key)
    out: List[Match] = []

    table = find_matches_table(soup)
    if not table:
        return out

    trs = table.find_all("tr")
    for tr in trs[1:]:
        tds = [norm(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
        if len(tds) < 2:
            continue

        home_team = tds[0]
        away_team = tds[1]
        if home_team != team_key and away_team != team_key:
            continue

        home_flag = (home_team == team_key)
        opponent = away_team if home_flag else home_team

        joined = " | ".join(tds)

        # Datum/čas: nejdřív z jednotlivých buněk, pak fallback z joined
        date_str = None
        time_str = None
        dt = None
        for cell in tds:
            d, t, ddt = parse_dt(cell)
            if d:
                date_str, time_str, dt = d, t, ddt
                break
        if not date_str:
            date_str, time_str, dt = parse_dt(joined)

        score_m = re.search(r"(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)", joined)
        pins_m = re.search(r"(\d{3,4})\s*:\s*(\d{3,4})", joined)

        score_text = f"{score_m.group(1)} : {score_m.group(2)}" if score_m else None
        pins_text = f"{pins_m.group(1)} : {pins_m.group(2)}" if pins_m else None

        played = False
        if pins_m:
            ph = int(pins_m.group(1))
            pa = int(pins_m.group(2))
            if not (ph == 0 and pa == 0):
                played = True
        if score_m and ("0 : 0" not in joined) and ("0:0" not in joined):
            played = True

        out.append(Match(
            date=date_str, time=time_str, dt=dt,
            home=home_flag, opponent=opponent,
            score=score_text, pins=pins_text,
            played=played
        ))

    return out


def pick_last_next(matches: List[Match]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    now = datetime.now(timezone.utc)

    played = [m for m in matches if m.played and m.dt is not None]
    future = [m for m in matches if (not m.played) and m.dt is not None]

    played.sort(key=lambda m: m.dt)
    future.sort(key=lambda m: m.dt)

    last = played[-1] if played else None

    nxt = None
    for m in future:
        if m.dt >= now:
            nxt = m
            break
    if nxt is None and future:
        nxt = future[0]

    def to_dict(m: Match) -> Dict[str, Any]:
        d = {
            "date": m.date,
            "time": m.time,
            "home": m.home,
            "opponent": m.opponent
        }
        if m.score:
            d["score"] = m.score
        if m.pins:
            d["pins"] = m.pins
        return d

    return (to_dict(last) if last else None, to_dict(nxt) if nxt else None)


def update_cka_team(
    team_id: str,
    competition_url: str,
    team_key: str,
    label: str
) -> None:
    # Nová adresa soutěže se předává přímo z COMPETITIONS.
base_url = competition_url

html = fetch(base_url)
    soup = BeautifulSoup(html, "lxml")

    table = parse_table(soup)

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
    data["table"] = table
    data["debug"] = data_debug

    save_json(path, data)

    print(f"OK: updated {team_id} from {base_url}")


def update_dorost() -> None:
    html = fetch(SKKS_DOROST_URL)
    soup = BeautifulSoup(html, "lxml")

    bulletins: List[Dict[str, str]] = []
    seen = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        text = norm(a.get_text(" ", strip=True))

        if not href.lower().endswith(".pdf"):
            continue
        if ("zpravodaj" not in text.lower()) and ("zpravodaj" not in href.lower()):
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

        bulletins.append({"title": text if text else "Zpravodaj", "url": url})

    path = BASE / "DOROST.json"
    data = load_json(path) if path.exists() else {}

    data["label"] = data.get("label", "Dorost – Středočeský pohár mládeže")
    data["source"] = {"type": "skks", "url": SKKS_DOROST_URL}
    data["updatedAt"] = iso_now()
    data["bulletins"] = bulletins

    save_json(path, data)
    print("OK: updated DOROST bulletins")


def main() -> None:
    failures = 0

    for team_id, cfg in COMPETITIONS.items():
        try:
            update_cka_team(team_id, cfg["url"], cfg["teamKey"], cfg["label"])
        except Exception as e:
            failures += 1
            print(f"ERROR: {team_id} failed: {e}")

  
    # ✅ když spadne všechno, tak fail (aby sis toho všiml)
    # ✅ když spadne jen něco, workflow necháme projít, data zůstanou stará
    if failures >= 4:
        raise RuntimeError("All sources failed")

if __name__ == "__main__":
    main()
