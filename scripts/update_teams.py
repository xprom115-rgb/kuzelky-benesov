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

# A/B/C – ČKA výsledkový servis
COMPETITIONS = {
    "A": {"competitionId": "c800", "teamKey": "TJ Sokol Benešov",   "label": "Družstvo A – 3. KLM B"},
    "B": {"competitionId": "c788", "teamKey": "TJ Sokol Benešov B", "label": "Družstvo B – Divize AS"},
    "C": {"competitionId": "c791", "teamKey": "TJ Sokol Benešov C", "label": "Družstvo C – Středočeský KP I. třídy"},
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
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text

def norm(s: str) -> str:
    return " ".join((s or "").replace("\xa0", " ").split()).strip()


# datum/čas typu "Po 1. 12. 2025 17.00" / "So 10. 4. 2026 17.30"
DT_RE = re.compile(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2})\.(\d{2}))?")

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

def parse_table(soup: BeautifulSoup) -> Dict[str, Any]:
    """
    Vrací tabulku celou:
      columns: [...]
      rows: [[...], [...], ...]
    Stabilní i když se mění počet sloupců.
    """
    target = None
    for table in soup.find_all("table"):
        txt = table.get_text(" ", strip=True)
        if ("Družstvo" in txt) and ("Body" in txt) and ("Zápasy" in txt):
            target = table
            break

    if not target:
        return {"columns": [], "rows": []}

    trs = target.find_all("tr")
    if not trs:
        return {"columns": [], "rows": []}

    header_cells = trs[0].find_all(["th", "td"])
    columns = [norm(c.get_text(" ", strip=True)) for c in header_cells]

    rows_out: List[List[str]] = []
    for tr in trs[1:]:
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        row = [norm(c.get_text(" ", strip=True)) for c in cells]
        if len(row) < len(columns):
            row += [""] * (len(columns) - len(row))
        if len(row) > len(columns):
            row = row[:len(columns)]
        rows_out.append(row)

    return {"columns": columns, "rows": rows_out}


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


def update_cka_team(team_id: str, comp_id: str, team_key: str, label: str) -> None:
    # ✅ bez www (kvůli SSL certifikátu)
    base_url = f"https://vysledky.kuzelky.cz/soutez.php?id={comp_id}"

    html = fetch(base_url)
    soup = BeautifulSoup(html, "lxml")

    table = parse_table(soup)

    rounds = find_round_numbers(soup)
    if not rounds:
        rounds = list(range(1, 40))

    matches_all: List[Match] = []
    for r in rounds:
        url_r = f"{base_url}&r={r}"
        try:
            html_r = fetch(url_r)
        except:
            continue
        soup_r = BeautifulSoup(html_r, "lxml")
        matches_all.extend(parse_team_matches_from_round(soup_r, team_key))

    last_m, next_m = pick_last_next(matches_all)

    data_debug = {
        "matchesFound": len(matches_all),
        "playedCount": len([m for m in matches_all if m.played]),
        "futureCount": len([m for m in matches_all if not m.played]),
        "teamKey": team_key,
        "competitionId": comp_id,
        "sample": []
    }
    for m in matches_all[:5]:
        data_debug["sample"].append({
            "date": m.date,
            "time": m.time,
            "home": m.home,
            "opponent": m.opponent,
            "played": m.played
        })

    path = BASE / f"{team_id}.json"
    data = load_json(path) if path.exists() else {}

    data["label"] = label
    data["source"] = {"type": "cka", "competitionId": comp_id, "teamKey": team_key}
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
    for team_id, cfg in COMPETITIONS.items():
        update_cka_team(team_id, cfg["competitionId"], cfg["teamKey"], cfg["label"])
    update_dorost()

if __name__ == "__main__":
    main()
``
