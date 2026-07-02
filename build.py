#!/usr/bin/env python3
"""Generate the interactive MQM-Core error typology explorer at ``dist/index.html``.

Downloads the official spreadsheet, parses it and injects it into ``template.html``. This is
the step the GitHub Pages workflow runs, but it also works for generating the view locally:

    uv run build.py            # -> dist/index.html
    uv run build.py --force    # re-download the spreadsheet

Everything intermediate (spreadsheet, JSON) is written to ``build/``, which git ignores.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from mqm_viz import build_typology, download_spreadsheet, render_html

ROOT = Path(__file__).resolve().parent
BUILD_DIR = ROOT / "build"
DIST_DIR = ROOT / "dist"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true", help="re-download the spreadsheet even if it exists"
    )
    args = parser.parse_args()

    BUILD_DIR.mkdir(exist_ok=True)
    DIST_DIR.mkdir(exist_ok=True)

    xlsx_path = download_spreadsheet(BUILD_DIR / "MQMFull_Master-Official.xlsx", force=args.force)
    print(f"Spreadsheet: {xlsx_path} ({xlsx_path.stat().st_size:,} bytes)")

    nodes = build_typology(xlsx_path)
    n_core = sum(n["core"] for n in nodes)
    print(f"Typology: {len(nodes)} nodes | {n_core} core | {len(nodes) - n_core} extensions")

    # Intermediate JSON, handy for inspection or feeding back into a notebook.
    (BUILD_DIR / "mqm_typology.json").write_text(
        json.dumps(nodes, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    html = render_html(nodes)
    out = DIST_DIR / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"HTML: {out} ({len(html):,} bytes)")


if __name__ == "__main__":
    main()
