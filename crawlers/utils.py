from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List, Dict, Optional

import requests
from bs4 import BeautifulSoup, Tag

try:
    from dateutil import parser as dateparser
except Exception:
    dateparser = None


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class FetchResult:
    url: str
    status_code: int
    content: bytes


def fetch(url: str, *, timeout: int = 20, max_retries: int = 3, backoff: float = 1.5) -> FetchResult:
 
    last_exc: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=timeout)
            time.sleep(0.6)
            return FetchResult(url=url, status_code=resp.status_code, content=resp.content)
        except Exception as exc:  
            last_exc = exc
            time.sleep(backoff ** attempt)
    if last_exc:
        raise last_exc
    raise RuntimeError(f"Failed to fetch {url}")


def get_soup(url: str) -> BeautifulSoup:
    res = fetch(url)
    if res.status_code >= 400:
        raise RuntimeError(f"HTTP {res.status_code} fetching {url}")
    return BeautifulSoup(res.content, "lxml")


def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def norm_key(s: str) -> str:
    s = norm_space(s).lower()
    s = s.replace("s.no", "serial").replace("s. no", "serial").replace("sl.no", "serial").replace("sl. no", "serial")
    s = s.replace("launch vehicle/mission", "launch_vehicle_mission")
    s = s.replace("launch vehicle", "launch_vehicle")
    s = s.replace("mission", "mission")
    s = s.replace("date of launch", "date").replace("date of lauch", "date")
    s = s.replace("date of mission", "date").replace("date of launch", "date")
    s = s.replace("orbit type", "orbit").replace("orbit", "orbit")
    s = s.replace("application", "application")
    s = s.replace("remarks", "remarks")
    s = s.replace("payload", "payload")
    s = s.replace("payloads", "payloads")
    s = s.replace("name of satellite", "name").replace("satellite", "name").replace("spacecraft", "name")
    s = re.sub(r"[^a-z0-9_]+", "_", s).strip("_")
    return s or "col"


def parse_date(value: str) -> str:
    v = norm_space(value)
    if not v:
        return ""
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y", "%b %Y", "%Y-%m-%d", "%Y"):
        try:
            dt = datetime.strptime(v, fmt)
            return dt.date().isoformat()
        except Exception:
            pass
    if dateparser is not None:
        try:
            dt = dateparser.parse(v, dayfirst=False, yearfirst=False)
            if dt:
                return dt.date().isoformat()
        except Exception:
            pass
    return v


def table_to_dicts(table: Tag) -> List[Dict[str, str]]:
    header_cells: List[Tag] = []
    thead = table.find("thead")
    if thead:
        tr = thead.find("tr")
        if tr:
            header_cells = list(tr.find_all(["th", "td"]))
    if not header_cells:
        first_tr = table.find("tr")
        if first_tr:
            header_cells = list(first_tr.find_all(["th", "td"]))

    headers = [norm_key(c.get_text(" ")) for c in header_cells]
    rows: List[Dict[str, str]] = []

    trs = table.find_all("tr")
    start_idx = 1 if (not thead and len(trs) > 0) else 0
    for tr in trs[start_idx:]:
        cells = [norm_space(td.get_text(" ")) for td in tr.find_all(["td", "th"])]
        if not cells or all(not c for c in cells):
            continue
        data = {}
        for i, val in enumerate(cells):
            key = headers[i] if i < len(headers) else f"col_{i+1}"
            data[key] = val
        rows.append(data)
    return rows


def save_jsonl(path: str, rows: Iterable[Dict]):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def save_json(path: str, rows: List[Dict]):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def save_csv(path: str, rows: List[Dict[str, str]]):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if not rows:
        with open(path, "w", encoding="utf-8") as f:
            f.write("")
        return
    import csv

    keys = sorted({k for r in rows for k in r.keys()})
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def extract_pagination_links(soup: BeautifulSoup, page_basename: str) -> List[str]:
    links: List[str] = []
    for a in soup.find_all("a"):
        txt = norm_space(a.get_text(" "))
        if not txt.isdigit():
            continue
        href = a.get("href")
        if not href:
            continue
        if page_basename in href:
            if href.startswith("http"):
                links.append(href)
            else:
                links.append(f"https://www.isro.gov.in/{href.lstrip('/')}")
    seen = set()
    uniq: List[str] = []
    for u in links:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq


def best_table_by_headers(soup: BeautifulSoup, expected_keys: Iterable[str]) -> Optional[Tag]:
    candidates = soup.find_all("table")
    if not candidates:
        return None
    expected = {norm_key(k) for k in expected_keys}
    best: Optional[Tag] = None
    best_score = -1
    for t in candidates:
        rows = table_to_dicts(t)
        if not rows:
            continue
        keys = set().union(*[set(r.keys()) for r in rows])
        score = len(keys & expected) * 100 + len(rows)
        if score > best_score:
            best_score = score
            best = t
    if best is None:
        best = max(candidates, key=lambda x: len(table_to_dicts(x)) if table_to_dicts(x) else 0)
    return best
