"""Step 2 of the build: parse the spreadsheet into typology nodes.

Standard library only — an ``.xlsx`` is just a zip of XML, so ``zipfile`` +
``xml.etree`` are enough; no ``openpyxl``/``pandas``.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

# Fixes applied to the source data (see README, "Changes from the source").
_PARENT_FIXES = {
    "locale-convention": "locale-conventions",
    "locale-specific-punctuation": "locale-specific punctuation",
}

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def _col_to_num(ref: str) -> int:
    """``'B3' -> 2`` (1-based column index)."""
    col = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def read_xlsx_sheet(path: Path, sheet_name: str) -> list[dict[int, str]]:
    """Read a sheet from an ``.xlsx`` using only ``zipfile`` + ``xml.etree``.

    Returns a list of rows; each row is ``{column_index: value}`` (1-based columns).
    """
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            sroot = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in sroot.findall(_NS + "si"):
                shared.append("".join(t.text or "" for t in si.iter(_NS + "t")))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        relmap = {r.get("Id"): r.get("Target") for r in rels}
        target = None
        for s in wb.iter(_NS + "sheet"):
            if s.get("name") == sheet_name:
                target = relmap[s.get(_RNS + "id")]
                break
        if target is None:
            raise ValueError(f"sheet {sheet_name!r} not found")
        if not target.startswith("xl/"):
            target = "xl/" + target.lstrip("/")
        sheet = ET.fromstring(z.read(target))

    rows: list[dict[int, str]] = []
    for r in sheet.iter(_NS + "row"):
        cells: dict[int, str] = {}
        for c in r.findall(_NS + "c"):
            t, v, inline = c.get("t"), c.find(_NS + "v"), c.find(_NS + "is")
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif inline is not None:
                val = "".join(x.text or "" for x in inline.iter(_NS + "t"))
            elif v is not None:
                val = v.text
            else:
                val = ""
            cells[_col_to_num(c.get("r"))] = val
        rows.append(cells)
    return rows


def build_typology(xlsx_path: Path, sheet_name: str = "MQMFull Master") -> list[dict]:
    """Parse the spreadsheet into a list of typology nodes.

    Columns in ``MQMFull Master``: A display name, B description, C examples, D notes,
    E level, F alphanumeric PID, G mnemonic id, H parent (mnemonic id), I note reference.

    Applies the source fixes (two typo'd *parent* references and one empty level cell) and
    derives the ``core`` flag from the PID prefix (``MQMC`` = Core, ``MQMN`` = Extension).
    Verifies that every *parent* resolves.
    """
    rows = read_xlsx_sheet(xlsx_path, sheet_name)

    nodes: list[dict] = []
    for r in rows[2:]:  # skip the title row and the header row
        name = (r.get(1) or "").strip()
        mid = (r.get(7) or "").strip()
        if not name or not mid:
            continue
        nodes.append(
            {
                "name": name,
                "desc": (r.get(2) or "").strip(),
                "ex": (r.get(3) or "").strip(),
                "notes": (r.get(4) or "").strip(),
                "level": (r.get(5) or "").strip(),
                "pid": (r.get(6) or "").strip(),
                "id": mid,
                "parent": (r.get(8) or "").strip(),
            }
        )

    for n in nodes:
        n["parent"] = _PARENT_FIXES.get(n["parent"], n["parent"])
        if not n["level"]:
            n["level"] = "2"  # the single row with an empty level cell
        n["core"] = n["pid"].startswith("MQMC")

    ids = {n["id"] for n in nodes}
    unresolved = {n["parent"] for n in nodes if n["parent"] and n["parent"] not in ids}
    if unresolved:
        raise ValueError(f"unresolved parents: {unresolved}")

    return nodes
