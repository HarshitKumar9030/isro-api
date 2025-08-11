from __future__ import annotations

from typing import List, Dict

try:
    from .utils import get_soup, save_json, save_csv, norm_space
except Exception:
    from utils import get_soup, save_json, save_csv, norm_space

BASE = "https://www.isro.gov.in/Timeline.html"


def scrape_timeline(limit_years: int | None = None) -> List[Dict[str, str]]:
    soup = get_soup(BASE)
    rows: List[Dict[str, str]] = []

    for a in soup.find_all("a"):
        href = a.get("href") or ""
        if "timeline=timeline" not in href:
            continue
        title = norm_space(a.get_text(" "))
        rows.append({
            "title": title,
            "url": href if href.startswith("http") else f"https://www.isro.gov.in/{href.lstrip('/')}",
        })

    seen = set()
    uniq: List[Dict[str, str]] = []
    for r in rows:
        u = r["url"]
        if u in seen:
            continue
        seen.add(u)
        uniq.append(r)

    return uniq


if __name__ == "__main__":
    data = scrape_timeline()
    save_json("data/timeline_links.json", data)
    save_csv("data/timeline_links.csv", data)
    print(f"Saved {len(data)} timeline items")
