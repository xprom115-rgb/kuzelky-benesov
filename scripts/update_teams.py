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
        "label": "Družstvo A – 3. KLM A",
    },
    "B": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/divize-as-2026-2027",
        "teamKey": "Benešov B",
        "label": "Družstvo B – Divize AS",
    },
    "C": {
        "url": "https://vysledky.kuzelky.cz/detail-souteze/krajsky-prebor-1-tridy-2026-2027",
        "teamKey": "Benešov C",
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
    return " ".join(
        (value or "").replace("\xa0", " ").split()
    ).strip()


def fetch(url: str) -> str:
    """
    Stáhne stránku pomocí requests.

    Při dočasném selhání provede až tři pokusy.
    """
    last_error: Optional[Exception] = None

    for attempt in range(1, 4):
        try:
            response = requests.get(
                url,
                headers=HEADERS,
                timeout=(20, 60),
            )
            response.raise_for_status()
            return response.text
        except Exception as error:
            last_error = error
            time.sleep(attempt)

    if last_error is not None:
        raise last_error

    raise RuntimeError(
        f"Nepodařilo se stáhnout URL: {url}"
    )


def fetch_rendered(url: str) -> str:
    """
    Otevře stránku v Chromium, počká na vykreslení obsahu
    pomocí JavaScriptu a vrátí výsledné HTML.
    """
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True
        )

        page = browser.new_page(
            viewport={
                "width": 1440,
                "height": 1200,
            },
            locale="cs-CZ",
        )

        try:
            page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=90000,
            )

            try:
                page.wait_for_selector(
                    "table",
                    timeout=30000,
                )
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
    r"(?:\s+"
    r"(?P<hour>\d{1,2})"
    r"\s*[:.]\s*"
    r"(?P<minute>\d{2})"
    r")?"
)


def parse_dt(
    text: str,
) -> Tuple[Optional[str], Optional[str], Optional[datetime]]:
    """
    Z textu načte datum a případný čas.

    Vrací:
    - datum ve formátu YYYY-MM-DD,
    - čas ve formátu HH:MM,
    - objekt datetime v UTC.
    """
    match = DT_RE.search(norm(text))

    if match is None:
        return None, None, None

    day = int(match.group("day"))
    month = int(match.group("month"))
    year = int(match.group("year"))

    hour_text = match.group("hour")
    minute_text = match.group("minute")

    date_string = (
        f"{year:04d}-"
        f"{month:02d}-"
        f"{day:02d}"
    )

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

    return (
        date_string,
        time_string,
        parsed_datetime,
    )


# ============================================================
# Celková tabulka soutěže
# ============================================================

def parse_table(soup: BeautifulSoup) -> Dict[str, Any]:
    """
    Načte soutěžní tabulku ze starého i nového servisu.

    Podporuje označení:
    - Družstvo nebo Tým,
    - Skóre nebo SB,
    - Body nebo B.
    """
    target = None

    for table in soup.find_all("table"):
        table_text = norm(table.get_text(" ", strip=True))

        has_team_column = (
            "Družstvo" in table_text
            or "Tým" in table_text
        )

        has_score_column = (
            "Skóre" in table_text
            or "SB" in table_text
        )

        has_points_column = (
            "Body" in table_text
            or re.search(r"\bB\b", table_text) is not None
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

    table_rows = target.find_all("tr")

    if not table_rows:
        return {
            "columns": [],
            "rows": []
        }

    header_cells = table_rows[0].find_all(["th", "td"])

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

    return {
        "columns": columns,
        "rows": rows_out
    }
    header
