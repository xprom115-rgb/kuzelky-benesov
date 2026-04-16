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

UTC_NOW = datetime.now(timezone.utc)

HEADERS = {
    "User-Agent": "kuzelky-benesov-bot/1.0 (+https://xprom115-rgb.github.io/kuzelky-benesov/)"
}

# --- Konfigurace soutěží A/B/C ---
COMPETITIONS = {
    "A": {"competitionId": "c800", "teamKey": "TJ Sokol Benešov", "label": "Družstvo A – 3. KLM B"},
    "B": {"competitionId": "c788", "teamKey": "TJ Sokol Benešov B", "label": "Družstvo B – Divize AS"},
    "C": {"competitionId": "c791", "teamKey": "TJ Sokol Benešov C", "label": "Družstvo C – Středočeský KP I. třídy"},
}

SKKS_DOROST_URL = "https://www.skks-kuzelky.cz/index.php/souteze/stredocesky-pohar-mladeze"

def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, obj: Dict[str, Any]):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def fetch(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text

def iso_now() -> str:
    return UTC_NOW.isoformat(timespec="seconds")

# --- parsování CZ datumu typu: "Po 1. 12. 2025 17.00" nebo "So 10. 4. 2026 17.30" ---
CZ_DAY_MAP = {"Po":0,"Út":1,"St":2,"Čt":3,"Pá":4,"So":5,"Ne":6}
DATE_RE = re.compile(r"(?:(Po|Út|St|Čt|Pá|So|Ne)\s+)?(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2})[.:](\d{2}))?")

def parse_cz_datetime(text: str) -> Tuple[Optional[str], Optional[str], Optional[datetime]]:
    m = DATE_RE.search(text.replace("\xa0"," "))
    if not m:
        return None, None, None
    dd = int(m.group(2)); mm = int(m.group(3)); yyyy = int(m.group(4))
    hh = m.group(5); mi = m.group(6)
    if hh is not None and mi is not None:
        time_str = f"{int(hh):02d}:{int(mi):02d}"
        dt = datetime(yyyy, mm, dd, int(hh), int(mi), tzinfo=timezone.utc)
    else:
        time_str = None
        dt = datetime(yyyy, mm, dd, 0, 0, tzinfo=timezone.utc)
    date_str = f"{yyyy:04d}-{mm:02d}-{dd:02d}"
    return date_str, time_str, dt

@dataclass
class Match:
    date: Optional[str]
    time: Optional[str]
    dt: Optional[datetime]
    home: Optional[bool]
    opponent: str
    score_home: Optional[int]
    score_away: Optional[int]
    pins_home: Optional[int]
    pins_away: Optional[int]
    url: str
    played: bool

def try_int(x: str) -> Optional[int]:
    x = x.strip()
    if not x:
        return None
    try:
        return int(x)
    except:
        return None

def normalize_team(s: str) -> str:
    return " ".join(s.replace("\xa0"," ").split()).strip()

def find_round_links(soup: BeautifulSoup) -> List[int]:
    rounds = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"[?&]r=(\d+)", href)
        if m:
            rounds.add(int(m.group(1)))
    return sorted(rounds)

def parse_table(soup: BeautifulSoup) -> Dict[str, Any]:
    """
    Vrátí tabulku jako:
      table.columns = [názvy sloupců]
      table.rows    = [ [hodnota1, hodnota2, ...] ]  (řádky ve stejném pořadí jako columns)
    => stabilní i když se změní počet sloupců.
    """
    # Najdeme tabulku, která má v hlavičce aspoň tyto klíčové sloupce
    target = None
    for table in soup.find_all("table"):
        header_text = table.get_text(" ", strip=True)
        if ("Družstvo" in header_text) and ("Body" in header_text) and ("Skóre" in header_text) and ("Zápasy" in header_text):
            target = table
            break

    if not target:
        return {"columns": [], "rows": []}

    trs = target.find_all("tr")
    if not trs:
        return {"columns": [], "rows": []}

    # Hlavička: vezmeme první řádek s th (když není, vezmeme td)
    header_cells = trs[0].find_all(["th", "td"])
    columns = [normalize_team(c.get_text(" ", strip=True)) for c in header_cells]

    rows_out = []
    for tr in trs[1:]:
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        row = [normalize_team(c.get_text(" ", strip=True)) for c in cells]

        # Srovnat délky: když je méně buněk než sloupců, doplníme prázdné
        if len(row) < len(columns):
            row = row + [""] * (len(columns) - len(row))
        # Když je více buněk, ořízneme (stává se u skrytých buněk)
        if len(row) > len(columns):
            row = row[:len(columns)]

        rows_out.append(row)

    return {"columns": columns, "rows": rows_out}

def parse_matches_from_round(soup: BeautifulSoup, team_key: str, base_url: str) -> List[Match]:
    """
    Najde tabulku zápasů pro kolo a vyfiltruje jen řádky, kde hraje team_key.
    Heuristika: tabulka zápasů obvykle obsahuje sloupce Domácí/Hosté a skóre/piny.
    """
    team_key_n = normalize_team(team_key)
    matches: List[Match] = []

    # vyber tabulku, která obsahuje "Domácí" a "Hosté"
    match_table = None
    for table in soup.find_all("table"):
        txt = table.get_text(" ", strip=True)
        if ("Domácí" in txt) and ("Hosté" in txt):
            match_table = table
            break

    if not match_table:
        return matches

    for tr in match_table.find_all("tr")[1:]:
        tds = [normalize_team(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
        if len(tds) < 4:
            continue

        # řádek obvykle: Domácí | Hosté | datum/čas | skóre | piny ... (liší se)
        # Zkusíme najít domácí a hosté jako první dvě položky
        home_team = tds[0]
        away_team = tds[1]

        if home_team != team_key_n and away_team != team_key_n:
            continue

        home_flag = (home_team == team_key_n)
        opponent = away_team if home_flag else home_team

        # najdi skóre typu "6 : 2" a piny typu "2504 : 2640"
        joined = " | ".join(tds)
        score_m = re.search(r"(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)", joined)
        pins_m = re.search(r"(\d{3,4})\s*:\s*(\d{3,4})", joined)

        score_home = score_away = None
        if score_m:
            # score může být i 3,5 : 4,5 -> uložíme jako string do score pokud není int
            sh = score_m.group(1).replace(",", ".")
            sa = score_m.group(2).replace(",", ".")
            # jen int skóre uložíme jako int, jinak necháme None a dáme do textových polí v JSON
            if sh.isdigit() and sa.isdigit():
                score_home = int(sh); score_away = int(sa)

        pins_home = pins_away = None
        if pins_m:
            pins_home = int(pins_m.group(1))
            pins_away = int(pins_m.group(2))

        # datum/čas zkusíme vyčíst z řádku (někde bývá třetí sloupec)
        date_str, time_str, dt = parse_cz_datetime(joined)

        played = False
        # pokud má piny a nejsou 0:0 a je skóre, bereme jako odehráno
        if pins_home is not None and pins_away is not None:
            if not (pins_home == 0 and pins_away == 0):
                played = True

        matches.append(Match(
            date=date_str,
            time=time_str,
            dt=dt,
            home=home_flag,
            opponent=opponent,
            score_home=score_home,
            score_away=score_away,
            pins_home=pins_home,
            pins_away=pins_away,
            url=base_url,
            played=played
        ))

    return matches

def compute_last_next(matches: List[Match]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    played = [m for m in matches if m.played and m.dt is not None]
    future = [m for m in matches if (not m.played) and m.dt is not None]

    played.sort(key=lambda m: m.dt)
    future.sort(key=lambda m: m.dt)

    last = played[-1] if played else None
    nxt = None
    for m in future:
        if m.dt >= UTC_NOW:
            nxt = m
            break
    if nxt is None and future:
        nxt = future[0]

    def to_dict(m: Match) -> Dict[str, Any]:
        d = {
            "date": m.date,
            "time": m.time,
            "home": m.home,
            "opponent": m.opponent,
            "matchUrl": m.url
        }
        if m.score_home is not None and m.score_away is not None:
            d["scoreHome"] = m.score_home
            d["scoreAway"] = m.score_away
        if m.pins_home is not None and m.pins_away is not None:
            d["pinsHome"] = m.pins_home
            d["pinsAway"] = m.pins_away
        return d

    return (to_dict(last) if last else None, to_dict(nxt) if nxt else None)

def update_cka_team(team_id: str, comp_id: str, team_key: str, label: str):
    base_url = f"https://vysledky.kuzelky.cz/soutez.php?id={comp_id}"
    html = fetch(base_url)
    soup = BeautifulSoup(html, "lxml")

    # tabulka celá
    table = parse_table(soup)

    # zjisti kola a stáhni několik posledních, abychom našli last/next jen pro Benešov
    rounds = find_round_links(soup)
    if not rounds:
        # fallback: zkusme jen aktuální stránku
        rounds = list(range(1, 27))

    matches_all: List[Match] = []
    # kvůli efektivitě: projdeme všechna kola, ale týdně 3 soutěže x ~26 = OK
    for r in rounds:
        url_r = f"{base_url}&r={r}"
        try:
            html_r = fetch(url_r)
        except:
            continue
        soup_r = BeautifulSoup(html_r, "lxml")
        matches_all.extend(parse_matches_from_round(soup_r, team_key, base_url))

    last_m, next_m = compute_last_next(matches_all)
data_debug = {
        "matchesFound": len(matches_all),
        "playedCount": len([m for m in matches_all if m.played]),
        "futureCount": len([m for m in matches_all if not m.played]),
        "teamKey": team_key,
        "competitionId": comp_id,
        "sample": [
            {
                "date": m.date,
                "time": m.time,
                "home": m.home,
                "opponent": m.opponent,
                "played": m.played
            }
            for m in matches_all[:5]
        ]
    }

    path = BASE / f"{team_id}.json"
    data = load_json(path) if path.exists() else {}
    data["label"] = label
    data["source"] = {"type": "cka", "competitionId": comp_id, "teamKey": team_key}
    data["updatedAt"] = iso_now()
    data["lastMatch"] = last_m
    data["nextMatch"] = next_m
    data["table"] = table

    save_json(path, data)
    print(f"OK: updated {team_id} from {base_url}")

def update_dorost():
    html = fetch(SKKS_DOROST_URL)
    soup = BeautifulSoup(html, "lxml")

    # Najdeme všechny PDF odkazy se slovem "zpravodaj" (nebo "Zpravodaj")
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = normalize_team(a.get_text(" ", strip=True))
        if href.lower().endswith(".pdf") and ("zpravodaj" in text.lower() or "zpravodaj" in href.lower()):
            # absolutní URL
            if href.startswith("/"):
                url = "https://www.skks-kuzelky.cz" + href
            elif href.startswith("http"):
                url = href
            else:
                url = "https://www.skks-kuzelky.cz/" + href.lstrip("./")
            links.append({"title": text if text else "Zpravodaj", "url": url})

    # deduplikace
    seen = set()
    bulletins = []
    for b in links:
        key = b["url"]
        if key in seen:
            continue
        seen.add(key)
        bulletins.append(b)

    path = BASE / "DOROST.json"
    data = load_json(path) if path.exists() else {}
    data["label"] = data.get("label", "Dorost – Středočeský pohár mládeže")
    data["source"] = {"type": "skks", "url": SKKS_DOROST_URL}
    data["updatedAt"] = iso_now()
    data["bulletins"] = bulletins

    save_json(path, data)
    print("OK: updated DOROST bulletins")

def main():
    for team_id, cfg in COMPETITIONS.items():
        update_cka_team(team_id, cfg["competitionId"], cfg["teamKey"], cfg["label"])
    update_dorost()

if __name__ == "__main__":
    main()
