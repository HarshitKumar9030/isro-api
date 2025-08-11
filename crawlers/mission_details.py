from __future__ import annotations

from typing import List, Dict, Optional

import re
from bs4 import BeautifulSoup

try:
    from .utils import get_soup, save_json, save_csv, norm_space, parse_date
except Exception:
    from utils import get_soup, save_json, save_csv, norm_space, parse_date


MISSIONS: List[Dict[str, str]] = [
    {
        "name": "Chandrayaan-3",
        "url": "https://www.isro.gov.in/Chandrayaan3_Details.html",
        "category": "lunar",
    },
    {
        "name": "Aditya-L1",
        "url": "https://www.isro.gov.in/Aditya_L1-MissionDetails.html",
        "category": "solar",
    },
    {
        "name": "Gaganyaan",
        "url": "https://www.isro.gov.in/Gaganyaan.html",
        "category": "human_spaceflight",
    },
    {
        "name": "Mars Orbiter Mission (MOM)",
        "url": "https://www.isro.gov.in/MarsOrbiterMissionSpacecraft.html",
        "category": "planetary",
    },
    {
        "name": "AstroSat",
        "url": "https://www.isro.gov.in/AstroSat.html",
        "category": "astronomy",
    },
]


def _text(el) -> str:
    if not el:
        return ""
    return norm_space(el.get_text(" "))


def _find_heading_sections(soup: BeautifulSoup) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {}
    for h in soup.find_all(["h1", "h2", "h3", "h4"]):
        title = _text(h).strip().lower()
        if not title:
            continue
        items: List[str] = []
        for sib in h.find_all_next():
            if sib == h:
                continue
            if sib.name in {"h1", "h2", "h3", "h4"}:
                break
            if sib.name in {"ul", "ol"}:
                for li in sib.find_all("li", recursive=False):
                    t = _text(li)
                    if t:
                        items.append(t)
            elif sib.name == "p":
                t = _text(sib)
                if t:
                    items.append(t)
        if items:
            sections[title] = items
    return sections


def _extract_kv_from_tables(soup: BeautifulSoup) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            tds = tr.find_all(["td", "th"])
            if len(tds) >= 2:
                key = _text(tds[0]).strip().rstrip(":").lower()
                val = _text(tds[1]).strip()
                if key and val and key not in out:
                    out[key] = val
    return out


def _guess_field(kvs: Dict[str, str], keys: List[str]) -> Optional[str]:
    for k in keys:
        for existing in kvs:
            if k in existing:
                return kvs[existing]
    return None


def _first_paragraph(soup: BeautifulSoup) -> Optional[str]:
    for p in soup.find_all("p"):
        t = _text(p)
        if t:
            return t
    return None


def scrape_mission_detail(url: str, name_hint: Optional[str] = None, category: Optional[str] = None) -> Dict[str, object]:
    soup = get_soup(url)

    title = name_hint or _text(soup.find(["h1", "h2"])) or ""
    kvs = _extract_kv_from_tables(soup)
    sections = _find_heading_sections(soup)

    launch_date = _guess_field(kvs, ["launch date", "date of launch", "date"]) or ""
    launch_vehicle = _guess_field(kvs, ["launch vehicle", "vehicle"]) or ""
    orbit = _guess_field(kvs, ["orbit", "halo orbit"]) or ""
    status = _guess_field(kvs, ["status"]) or ""

    ld_parsed = parse_date(launch_date) if launch_date else ""

    objectives: List[str] = []
    for sec_key in sections.keys():
        if any(x in sec_key for x in ["objective", "goals", "aims"]):
            objectives = sections[sec_key]
            break

    payloads: List[str] = []
    for sec_key in sections.keys():
        if "payload" in sec_key or "instrument" in sec_key:
            payloads = sections[sec_key]
            break

    notable_events: List[str] = []
    for sec_key in sections.keys():
        if any(x in sec_key for x in ["update", "milestone", "event", "achievement"]):
            notable_events.extend(sections[sec_key])

    summary = _first_paragraph(soup) or ""

    return {
        "name": title or name_hint or "",
        "url": url,
        "category": category or "",
        "launch_date": ld_parsed or launch_date,
        "launch_vehicle": launch_vehicle,
        "orbit": orbit,
        "status": status,
        "objectives": objectives,
        "payloads": payloads,
        "notable_events": notable_events,
        "summary": summary,
        "source": "isro.gov.in",
    }


def scrape_all_mission_details() -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    for m in MISSIONS:
        out.append(
            scrape_mission_detail(url=m["url"], name_hint=m.get("name"), category=m.get("category"))
        )
    return out


if __name__ == "__main__":
    data = scrape_all_mission_details()
    save_json("data/mission_details.json", data)
    save_csv("data/mission_details.csv", data)
    print(f"Saved {len(data)} mission details rows")
