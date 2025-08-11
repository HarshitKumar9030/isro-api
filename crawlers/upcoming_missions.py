from __future__ import annotations

from typing import List, Dict

try:
    from .utils import get_soup, save_json, save_csv, norm_space
except Exception:
    from utils import get_soup, save_json, save_csv, norm_space

BASE = "https://www.isro.gov.in/FutureMissions.html"


def scrape_upcoming() -> List[Dict[str, str]]:
    soup = get_soup(BASE)
    rows: List[Dict[str, str]] = []

    for a in soup.find_all("a"):
        href = a.get("href") or ""
        text = norm_space(a.get_text(" "))
        if not text:
            continue
        if any(key in href for key in ("Gaganyaan", "NISAR", "Mission", "mission")):
            url = href if href.startswith("http") else f"https://www.isro.gov.in/{href.lstrip('/') }"
            rows.append({"title": text, "url": url})

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
    data = scrape_upcoming()
    save_json("data/upcoming_missions.json", data)
    save_csv("data/upcoming_missions.csv", data)
    print(f"Saved {len(data)} upcoming mission items")
