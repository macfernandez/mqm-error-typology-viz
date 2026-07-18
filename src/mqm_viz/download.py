"""Step 1 of the build: download the official MQM-Full spreadsheet."""

from __future__ import annotations

import urllib.request
from pathlib import Path

# Direct link behind the "Download the MQM-Full Spreadsheet" button on themqm.org/downloads/
XLSX_URL = "https://themqm.org/wp-content/uploads/2024/03/2024_03-07-MQMFull_Master-Official.xlsx"

# The server returns HTTP 406 for a bare urllib request: a browser User-Agent is required.
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept": "*/*",
}


def download_spreadsheet(dest: Path, url: str = XLSX_URL, *, force: bool = False) -> Path:
    """Download the MQM-Full spreadsheet to ``dest`` (skips if it already exists)."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        return dest
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as fh:
        fh.write(resp.read())
    return dest
