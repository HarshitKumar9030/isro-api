from __future__ import annotations

import os

try:
    from .spacecraft_missions import scrape_spacecraft
    from .launch_missions import scrape_launches
    from .timeline import scrape_timeline
    from .upcoming_missions import scrape_upcoming
    from .utils import save_json, save_csv
except Exception:
    import sys as _sys, os as _os
    _CUR = _os.path.dirname(_os.path.abspath(__file__))
    if _CUR not in _sys.path:
        _sys.path.insert(0, _CUR)
    from spacecraft_missions import scrape_spacecraft
    from launch_missions import scrape_launches
    from timeline import scrape_timeline
    from upcoming_missions import scrape_upcoming
    from utils import save_json, save_csv


def ensure_data_dir():
    os.makedirs("data", exist_ok=True)


def main():
    ensure_data_dir()

    spacecraft = scrape_spacecraft()
    save_json("data/spacecraft_missions.json", spacecraft)
    save_csv("data/spacecraft_missions.csv", spacecraft)

    launches = scrape_launches()
    save_json("data/launch_missions.json", launches)
    save_csv("data/launch_missions.csv", launches)

    timeline = scrape_timeline()
    save_json("data/timeline_links.json", timeline)
    save_csv("data/timeline_links.csv", timeline)

    upcoming = scrape_upcoming()
    save_json("data/upcoming_missions.json", upcoming)
    save_csv("data/upcoming_missions.csv", upcoming)

    print(
        "Done. Spacecraft: {sc}, Launches: {ln}, Timeline: {tl}, Upcoming: {up}".format(
            sc=len(spacecraft), ln=len(launches), tl=len(timeline), up=len(upcoming)
        )
    )


if __name__ == "__main__":
    main()
