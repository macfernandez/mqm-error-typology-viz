"""Build the interactive MQM-Core error typology explorer.

A three-step flow, one module per step (used by both ``build.py`` and the
narrative notebook):

1. :mod:`mqm_viz.download` — download the official MQM-Full spreadsheet.
2. :mod:`mqm_viz.parse` — parse it (standard library only) into a list of nodes.
3. :mod:`mqm_viz.render` — inline the nodes and the JS assets into ``template.html``.

The error typology is the **MQM Error Typology** (MQM-Core), (c) The MQM Council, published
at https://themqm.org and obtained from the MQM-Full spreadsheet at
https://themqm.org/downloads/, under the CC BY 4.0 license. See the README for the full
attribution and the changes made relative to the source.
"""

from __future__ import annotations

from mqm_viz.download import XLSX_URL, download_spreadsheet
from mqm_viz.parse import build_typology, read_xlsx_sheet
from mqm_viz.render import render_html

__all__ = [
    "XLSX_URL",
    "download_spreadsheet",
    "read_xlsx_sheet",
    "build_typology",
    "render_html",
]
