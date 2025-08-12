from __future__ import annotations

from typing import List, Dict
try:
    from .utils import get_soup, norm_space, save_json, save_csv
except Exception:
    from utils import get_soup, norm_space, save_json, save_csv


VEHICLES = [
    ("PSLV", "https://www.isro.gov.in/PSLV_CON.html"),
    ("GSLV", "https://www.isro.gov.in/GSLV_CON.html"),
    ("LVM3", "https://www.isro.gov.in/LVM3.html"),
]


def scrape_vehicle_specs() -> List[Dict]:
    out: List[Dict] = []
    for name, url in VEHICLES:
        try:
            soup = get_soup(url)
            text = norm_space(soup.get_text(" "))
            out.append({"vehicle": name, "url": url, "content": text[:10000]})
        except Exception:
            # Skip missing or moved pages to avoid halting entire run
            continue
    return out


if __name__ == "__main__":
    rows = scrape_vehicle_specs()
    save_json("data/launch_vehicle_specs.json", rows)
    save_csv("data/launch_vehicle_specs.csv", rows)
