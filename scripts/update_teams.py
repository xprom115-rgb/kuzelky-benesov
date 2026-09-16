import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright


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

COMPETITIONS = {
    "A": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/3-klm-a-2026-2027",
        "teamKey": "Benešov",
        "teamSlug": "tj-sokol-benesov-muzi",
        "label": "Družstvo A – 3. KLM A",
    },
    "B": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/divize-as-2026-2027",
        "teamKey": "Benešov B",
        "teamSlug": "tj-sokol-benesov-b-muzi",
        "label": "Družstvo B – Divize AS",
    },
    "C": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/krajsky-prebor-1-tridy-2026-2027",
        "teamKey": "Benešov C",
        "teamSlug": "tj-sokol-benesov-c-muzi",
        "label": "Družstvo C – Krajský přebor 1. třídy",
    },
}

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
        encoding="utf-8",
    )


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def norm(value: str) -> str:
    return " ".join((value or "").replace("\xa0", " ").split()).strip()


def fetch(url: str) -> str:
    """Stáhne stránku. Při dočasném selhání provede až tři pokusy."""
    last_error: Optional[Exception] = None

    for attempt in range(1, 4):
        try:
            response = requests.get(url, headers=HEADERS, timeout=(20, 60))
            response.raise_for_status()
            return response.text
        except Exception as error:
            last_error = error
            time.sleep(attempt)

    if last_error is not None:
        raise last_error

    raise RuntimeError(f"Nepodařilo se stáhnout URL: {url}")


def fetch_rendered(url: str) -> str:
    """Načte JavaScriptem vykreslené HTML stránky soutěže."""
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1440, "height": 1200},
            locale="cs-CZ",
        )

        try:
            page.goto(url, wait_until="domcontentloaded", timeout=90000)

            try:
                page.wait_for_selector("table", timeout=30000)
            except Exception:
                pass

            try:
                page.wait_for_selector(
                    'a[href*="/detail-zapasu/"]',
                    timeout=15000,
                )
            except Exception:
                pass

            page.wait_for_timeout(5000)
            return page.content()
        finally:
            browser.close()


# ============================================================
# Datum a čas
# ============================================================

DT_RE = re.compile(
    r"(?P<day>\d{1,2})\.\s*"
    r"(?P<month>\d{1,2})\.\s*"
    r"(?P<year>\d{4})"
    r"(?:\s+(?P<hour>\d{1,2})\s*[:.]\s*(?P<minute>\d{2}))?"
)


def parse_dt(
    text: str,
) -> Tuple[Optional[str], Optional[str], Optional[datetime]]:
    match = DT_RE.search(norm(text))

    if match is None:
        return None, None, None

    day = int(match.group("day"))
    month = int(match.group("month"))
    year = int(match.group("year"))
    hour_text = match.group("hour")
    minute_text = match.group("minute")

    date_string = f"{year:04d}-{month:02d}-{day:02d}"

    if hour_text is not None and minute_text is not None:
        hour = int(hour_text)
        minute = int(minute_text)
        time_string = f"{hour:02d}:{minute:02d}"
    else:
        hour = 0
        minute = 0
        time_string = None

    parsed_datetime = datetime(
        year,
        month,
        day,
        hour,
        minute,
        tzinfo=timezone.utc,
    )

    return date_string, time_string, parsed_datetime


# ============================================================
# Celková tabulka soutěže
# ============================================================

def parse_table(soup: BeautifulSoup) -> Dict[str, Any]:
    """Načte soutěžní tabulku ze stránky soutěže."""
    target = None

    for table in soup.find_all("table"):
        table_text = norm(table.get_text(" ", strip=True))
        has_team = "Družstvo" in table_text or "Tým" in table_text
        has_score = "Skóre" in table_text or "SB" in table_text
        has_points = (
            "Body" in table_text
            or re.search(r"\bB\b", table_text) is not None
        )

        if has_team and has_score and has_points:
            target = table
            break

    if target is None:
        return {"columns": [], "rows": []}

    table_rows = target.find_all("tr")
    if not table_rows:
        return {"columns": [], "rows": []}

    columns = [
        norm(cell.get_text(" ", strip=True))
        for cell in table_rows[0].find_all(["th", "td"])
    ]

    if not columns:
        return {"columns": [], "rows": []}

    rows_out: List[List[str]] = []

    for row_element in table_rows[1:]:
        cells = row_element.find_all(["td", "th"])
        if not cells:
            continue

        row = [norm(cell.get_text(" ", strip=True)) for cell in cells]
        if not any(row):
            continue

        if len(row) < len(columns):
            row.extend([""] * (len(columns) - len(row)))
        elif len(row) > len(columns):
            row = row[:len(columns)]

        rows_out.append(row)

    return {"columns": columns, "rows": rows_out}


# ============================================================
# Názvy družstev
# ============================================================

def normalize_team_name(name: str) -> str:
    value = norm(name).casefold()
    value = re.sub(r"[.,;:()]+", " ", value)
    return norm(value)


def team_matches(name: str, team_key: str) -> bool:
    value = normalize_team_name(name)
    key = normalize_team_name(team_key)
    return bool(value and key and (value == key or key in value))


# ============================================================
# Zápasy
# ============================================================

def find_match_container(anchor: Any) -> Optional[Any]:
    """
    Najde nejmenší rodičovský blok obsahující právě jeden zápas,
    datum a nejméně dva odkazy na družstva.
    """
    candidate = anchor

    for _ in range(10):
        if candidate is None:
            return None

        match_links = {
            urljoin(
                "https://vysledky.kuzelky.cz",
                item.get("href", ""),
            )
            for item in candidate.find_all("a", href=True)
            if "/detail-zapasu/" in item.get("href", "")
        }

        team_links = candidate.find_all(
            "a",
            href=lambda href: href and "/detail-druzstva/" in href,
        )
        text = norm(candidate.get_text(" ", strip=True))

        if (
            len(match_links) == 1
            and len(team_links) >= 2
            and DT_RE.search(text) is not None
            and len(text) < 1200
        ):
            return candidate

        candidate = candidate.parent

    return None


def unique_team_names(container: Any) -> List[str]:
    """Vrátí první dva různé názvy družstev v pořadí z HTML."""
    names: List[str] = []
    seen = set()

    for anchor in container.find_all(
        "a",
        href=lambda href: href and "/detail-druzstva/" in href,
    ):
        name = norm(anchor.get_text(" ", strip=True)).rstrip(".")
        key = normalize_team_name(name)

        if not name or not key or key in seen:
            continue

        seen.add(key)
        names.append(name)

        if len(names) == 2:
            break

    return names


def parse_match_cards(
    soup: BeautifulSoup,
    team_key: str,
    team_slug: str,
) -> List[Dict[str, Any]]:
    """
    Načte pouze zápasy konkrétního družstva.

    Odkazy nejprve filtruje podle jednoznačného slugu družstva.
    Data následně čte pouze z bloku obsahujícího jediný zápas.
    """
    output: List[Dict[str, Any]] = []
    seen_urls = set()
    normalized_slug = team_slug.casefold().strip("/")

    for anchor in soup.find_all("a", href=True):
        href = norm(anchor.get("href", ""))

        if "/detail-zapasu/" not in href:
            continue

        if normalized_slug not in href.casefold():
            continue

        absolute_url = urljoin("https://vysledky.kuzelky.cz", href)

        if absolute_url in seen_urls:
            continue

        seen_urls.add(absolute_url)
        container = find_match_container(anchor)

        if container is None:
            print(
                f"DEBUG NO CONTAINER [{team_key}]: "
                f"href={href!r}, "
                f"anchor={norm(anchor.get_text(' ', strip=True))!r}"
            )
            continue

        card_text = norm(container.get_text(" ", strip=True))
        date_string, time_string, parsed_dt = parse_dt(card_text)

        if not date_string or parsed_dt is None:
            print(
                f"DEBUG NO DATE [{team_key}]: "
                f"href={href!r}, card_text={card_text!r}"
            )
            continue

        team_names = unique_team_names(container)

        if len(team_names) < 2:
            print(
                f"DEBUG NO TEAMS [{team_key}]: "
                f"href={href!r}, card_text={card_text!r}"
            )
            continue

        home_name = team_names[0]
        away_name = team_names[1]

        if not (
            team_matches(home_name, team_key)
            or team_matches(away_name, team_key)
        ):
            print(
                f"DEBUG TEAM MISMATCH [{team_key}]: "
                f"home={home_name!r}, away={away_name!r}, href={href!r}"
            )
            continue

        # Po odstranění data a času nelze zaměnit 18:00 za výsledek.
        result_text = DT_RE.sub("", card_text, count=1)

        # Družstevní skóre 0 až 8, případně půlbod, např. 4.5:3.5.
        score_match = re.search(
            r"(?<!\d)([0-8](?:[.,]5)?)\s*:\s*([0-8](?:[.,]5)?)(?!\d)",
            result_text,
        )

        pins_matches = list(
            re.finditer(
                r"(?<!\d)(\d{3,4})\s*:\s*(\d{3,4})(?!\d)",
                result_text,
            )
        )

        result = None
        if score_match is not None:
            result = (
                f"{score_match.group(1).replace(',', '.')}:"
                f"{score_match.group(2).replace(',', '.')}"
            )

        pins = None
        if pins_matches:
            pins_match = pins_matches[-1]
            pins = f"{pins_match.group(1)}:{pins_match.group(2)}"

        played = result is not None or pins is not None

        round_match = re.search(
            r"(?:^|-)kolo-(\d+)(?:-|$)",
            href,
            re.IGNORECASE,
        )
        round_number = int(round_match.group(1)) if round_match else None

        output.append(
            {
                "round": round_number,
                "date": date_string,
                "time": time_string,
                "dt": parsed_dt,
                "home": home_name,
                "away": away_name,
                "result": result,
                "pins": pins,
                "played": played,
                "url": absolute_url,
            }
        )

    unique = {item["url"]: item for item in output}
    return sorted(unique.values(), key=lambda item: item["dt"])


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
        "url": item.get("url"),
    }


# ============================================================
# Aktualizace A/B/C
# ============================================================

def update_cka_team(
    team_id: str,
    competition_url: str,
    team_key: str,
    team_slug: str,
    label: str,
) -> None:
    html = fetch_rendered(competition_url)
    soup = BeautifulSoup(html, "lxml")

    all_match_links_count = len(
        [
            anchor
            for anchor in soup.find_all("a", href=True)
            if "/detail-zapasu/" in anchor.get("href", "")
        ]
    )

    team_match_links_count = len(
        [
            anchor
            for anchor in soup.find_all("a", href=True)
            if (
                "/detail-zapasu/" in anchor.get("href", "")
                and team_slug.casefold() in anchor.get("href", "").casefold()
            )
        ]
    )

    print(f"DEBUG {team_id}: rendered HTML length={len(html)}")
    print(f"DEBUG {team_id}: tables={len(soup.find_all('table'))}")
    print(f"DEBUG {team_id}: all match links={all_match_links_count}")
    print(f"DEBUG {team_id}: team match links={team_match_links_count}")

    table = parse_table(soup)
    all_matches = parse_match_cards(soup, team_key, team_slug)

    past_matches = [
        public_match(match) for match in all_matches if match["played"]
    ]
    future_matches = [
        public_match(match) for match in all_matches if not match["played"]
    ]

    now = datetime.now(timezone.utc)
    completed = [
        match
        for match in all_matches
        if match["played"] and match.get("dt") is not None
    ]
    upcoming = [
        match
        for match in all_matches
        if (
            not match["played"]
            and match.get("dt") is not None
            and match["dt"] >= now
        )
    ]

    completed.sort(key=lambda match: match["dt"])
    upcoming.sort(key=lambda match: match["dt"])

    last_match = public_match(completed[-1]) if completed else None
    next_match = public_match(upcoming[0]) if upcoming else None

    path = BASE / f"{team_id}.json"

    if path.exists():
        try:
            data = load_json(path)
        except Exception as error:
            print(
                f"WARNING {team_id}: původní JSON nelze načíst: "
                f"{type(error).__name__}: {error}"
            )
            data = {}
    else:
        data = {}

    if table.get("columns") and table.get("rows"):
        data["table"] = table
        table_status = "updated"
    elif isinstance(data.get("table"), dict) and data["table"].get("rows"):
        table_status = "kept_previous"
    else:
        data["table"] = table
        table_status = "empty"

    data["label"] = label
    data["source"] = {
        "type": "cka",
        "url": competition_url,
        "teamKey": team_key,
        "teamSlug": team_slug,
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
        "allMatchLinksFound": all_match_links_count,
        "teamMatchLinksFound": team_match_links_count,
        "teamKey": team_key,
        "teamSlug": team_slug,
        "competitionUrl": competition_url,
        "sample": [public_match(match) for match in all_matches[:3]],
    }

    save_json(path, data)

    print(
        f"OK: {team_id}: table={table_status}, "
        f"matches={len(all_matches)}, "
        f"past={len(past_matches)}, future={len(future_matches)}"
    )


# ============================================================
# Dorost, zatím se v main() nespouští
# ============================================================

def update_dorost() -> None:
    html = fetch(SKKS_DOROST_URL)
    soup = BeautifulSoup(html, "lxml")
    bulletins: List[Dict[str, str]] = []
    seen = set()

    for anchor in soup.find_all("a", href=True):
        href = norm(anchor.get("href", ""))
        text = norm(anchor.get_text(" ", strip=True))

        if not href.lower().endswith(".pdf"):
            continue

        if "zpravodaj" not in text.lower() and "zpravodaj" not in href.lower():
            continue

        url = urljoin("https://www.skks-kuzelky.cz/", href)
        if url in seen:
            continue

        seen.add(url)
        bulletins.append({"title": text or "Zpravodaj", "url": url})

    path = BASE / "DOROST.json"

    if path.exists():
        try:
            data = load_json(path)
        except Exception as error:
            print(
                "WARNING DOROST: původní JSON nelze načíst: "
                f"{type(error).__name__}: {error}"
            )
            data = {}
    else:
        data = {}

    data["label"] = data.get(
        "label",
        "Dorost – Středočeský pohár mládeže",
    )
    data["source"] = {"type": "skks", "url": SKKS_DOROST_URL}
    data["updatedAt"] = iso_now()
    data["bulletins"] = bulletins

    save_json(path, data)
    print(f"OK: DOROST bulletins={len(bulletins)}")


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
                config["teamSlug"],
                config["label"],
            )
        except Exception as error:
            failures += 1
            print(
                f"ERROR: {team_id} failed: "
                f"{type(error).__name__}: {error}"
            )

    if failures >= len(COMPETITIONS):
        raise RuntimeError("All A/B/C sources failed")


if __name__ == "__main__":
    main()
