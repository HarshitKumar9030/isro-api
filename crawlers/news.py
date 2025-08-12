from __future__ import annotations

from typing import List, Dict
try:
    from .utils import get_soup, norm_space, save_json, save_csv
except Exception:
    from utils import get_soup, norm_space, save_json, save_csv


def scrape_news(limit: int = 100) -> List[Dict]:
    base = "https://www.isro.gov.in"
    url = f"{base}/Press.html"
    soup = get_soup(url)
    items: List[Dict] = []
    for a in soup.select('a'):
        title = norm_space(a.get_text(" "))
        href = a.get('href') or ''
        if not title or 'press' not in href.lower():
            continue
        link = href if href.startswith('http') else f"{base}/{href.lstrip('/')}"
        items.append({"title": title, "url": link})
        if len(items) >= limit:
            break
    return items


if __name__ == "__main__":
    rows = scrape_news()
    save_json("data/news.json", rows)
    save_csv("data/news.csv", rows)
