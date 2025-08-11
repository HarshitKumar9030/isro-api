from __future__ import annotations

from typing import List, Dict

from bs4 import BeautifulSoup

try:
    from .utils import (
        get_soup,
        best_table_by_headers,
        table_to_dicts,
        extract_pagination_links,
        save_json,
        save_csv,
        parse_date,
    )
except Exception:
    from utils import (
        get_soup,
        best_table_by_headers,
        table_to_dicts,
        extract_pagination_links,
        save_json,
        save_csv,
        parse_date,
    )

BASE = "https://www.isro.gov.in/SpacecraftMissions.html"
EXPECTED_HEADERS = [
    "S.No.",
    "Name of Satellite",
    "Date of Launch",
    "Launch Vehicle/Mission",
    "Orbit",
    "Application",
    "Remarks",
]


def normalize_rows(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for r in rows:
        row = dict(r)
        if "date" in row:
            row["date"] = parse_date(row.get("date", ""))
        lvm = row.get("launch_vehicle_mission") or row.get("launch_vehicle") or ""
        if lvm and "/" in lvm:
            parts = [p.strip() for p in lvm.split("/", 1)]
            row.setdefault("launch_vehicle", parts[0])
            row.setdefault("mission", parts[1])
        out.append(row)
    return out


def scrape_spacecraft() -> List[Dict[str, str]]:
    first = get_soup(BASE)
    table = best_table_by_headers(first, EXPECTED_HEADERS)
    if table is None:
        return []
    rows = table_to_dicts(table)

    pages = extract_pagination_links(first, "SpacecraftMissions")
    urls = [BASE] + [u for u in pages if u != BASE]

    all_rows: List[Dict[str, str]] = []
    for i, url in enumerate(urls):
        if i > 0:
            soup = get_soup(url)
            t = best_table_by_headers(soup, EXPECTED_HEADERS)
            if not t:
                continue
            page_rows = table_to_dicts(t)
        else:
            page_rows = rows
        all_rows.extend(page_rows)

    return normalize_rows(all_rows)


if __name__ == "__main__":
    data = scrape_spacecraft()
    save_json("data/spacecraft_missions.json", data)
    save_csv("data/spacecraft_missions.csv", data)
    print(f"Saved {len(data)} spacecraft mission rows")
