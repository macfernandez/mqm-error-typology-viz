"""Unit tests for the mqm_viz package (parse, render, download). Run with:

    uv run python -m unittest discover -s tests -v

Standard library only, matching the package itself: the spreadsheet fixtures are
synthetic ``.xlsx`` files built with ``zipfile`` + hand-written XML, so no network
and no openpyxl are needed.
"""

from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from mqm_viz import build_typology, download_spreadsheet, read_xlsx_sheet, render_html
from mqm_viz.parse import _col_to_num

_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def make_xlsx(path: Path, rows: list[dict[str, str]], sheet_name: str = "MQMFull Master") -> Path:
    """Write a minimal ``.xlsx`` with one sheet; each row maps column letter -> value.

    Values are written as inline strings — the code path shared strings take is
    covered separately in ``test_read_xlsx_shared_strings``.
    """
    row_xml = []
    for i, row in enumerate(rows, start=1):
        cells = "".join(
            f'<c r="{col}{i}" t="inlineStr"><is><t>{val}</t></is></c>'
            for col, val in row.items()
        )
        row_xml.append(f'<row r="{i}">{cells}</row>')
    sheet = (
        f'<worksheet xmlns="{_MAIN_NS}"><sheetData>{"".join(row_xml)}</sheetData></worksheet>'
    )
    workbook = (
        f'<workbook xmlns="{_MAIN_NS}" xmlns:r="{_REL_NS}">'
        f'<sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    rels = (
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="' + _REL_NS + '/worksheet" '
        'Target="worksheets/sheet1.xml"/></Relationships>'
    )
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/workbook.xml", workbook)
        z.writestr("xl/_rels/workbook.xml.rels", rels)
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    return path


# Column layout expected by build_typology: A name, B desc, C examples, D notes,
# E level, F PID, G mnemonic id, H parent.
def node_row(name, level, pid, mid, parent, desc="", ex=""):
    return {"A": name, "B": desc, "C": ex, "E": level, "F": pid, "G": mid, "H": parent}


HEADER_ROWS = [{"A": "MQM Error Typology"}, {"A": "Name", "G": "ID"}]


class TestColToNum(unittest.TestCase):
    def test_single_and_double_letters(self):
        self.assertEqual(_col_to_num("A1"), 1)
        self.assertEqual(_col_to_num("B3"), 2)
        self.assertEqual(_col_to_num("Z9"), 26)
        self.assertEqual(_col_to_num("AA12"), 27)


class TestReadXlsxSheet(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_rows_keyed_by_one_based_column(self):
        p = make_xlsx(self.dir / "t.xlsx", [{"A": "x", "C": "y"}])
        rows = read_xlsx_sheet(p, "MQMFull Master")
        self.assertEqual(rows, [{1: "x", 3: "y"}])

    def test_missing_sheet_raises(self):
        p = make_xlsx(self.dir / "t.xlsx", [{"A": "x"}])
        with self.assertRaises(ValueError):
            read_xlsx_sheet(p, "No Such Sheet")

    def test_read_xlsx_shared_strings(self):
        sheet = (
            f'<worksheet xmlns="{_MAIN_NS}"><sheetData>'
            '<row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1"><v>42</v></c></row>'
            "</sheetData></worksheet>"
        )
        workbook = (
            f'<workbook xmlns="{_MAIN_NS}" xmlns:r="{_REL_NS}">'
            '<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
        )
        rels = (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="' + _REL_NS + '/worksheet" '
            'Target="worksheets/sheet1.xml"/></Relationships>'
        )
        sst = (
            f'<sst xmlns="{_MAIN_NS}"><si><t>zero</t></si>'
            "<si><t>first</t><t> second</t></si></sst>"
        )
        p = self.dir / "shared.xlsx"
        with zipfile.ZipFile(p, "w") as z:
            z.writestr("xl/workbook.xml", workbook)
            z.writestr("xl/_rels/workbook.xml.rels", rels)
            z.writestr("xl/worksheets/sheet1.xml", sheet)
            z.writestr("xl/sharedStrings.xml", sst)
        rows = read_xlsx_sheet(p, "S")
        # multi-<t> shared strings are concatenated; plain <v> cells pass through
        self.assertEqual(rows, [{1: "first second", 2: "42"}])


class TestBuildTypology(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def build(self, data_rows):
        p = make_xlsx(self.dir / "t.xlsx", HEADER_ROWS + data_rows)
        return build_typology(p)

    def test_parses_nodes_and_derives_core_flag(self):
        nodes = self.build(
            [
                node_row("Accuracy", "0", "MQMC-A", "accuracy", "", desc="dim "),
                node_row("Term", "1", "MQMN-010", "term", "accuracy"),
            ]
        )
        self.assertEqual([n["id"] for n in nodes], ["accuracy", "term"])
        self.assertEqual(nodes[0]["desc"], "dim")  # stripped
        self.assertTrue(nodes[0]["core"])
        self.assertFalse(nodes[1]["core"])

    def test_skips_title_header_and_incomplete_rows(self):
        nodes = self.build(
            [
                node_row("Accuracy", "0", "MQMC-A", "accuracy", ""),
                node_row("No id", "1", "MQMC-X", "", "accuracy"),
                node_row("", "1", "MQMC-Y", "no-name", "accuracy"),
            ]
        )
        self.assertEqual([n["id"] for n in nodes], ["accuracy"])

    def test_applies_parent_fixes(self):
        nodes = self.build(
            [
                node_row("Locale conventions", "1", "MQMC-L", "locale-conventions", ""),
                node_row("Child", "2", "MQMC-LC", "child", "locale-convention"),
            ]
        )
        self.assertEqual(nodes[1]["parent"], "locale-conventions")

    def test_empty_level_defaults_to_two(self):
        nodes = self.build([node_row("X", "", "MQMC-X", "x", "")])
        self.assertEqual(nodes[0]["level"], "2")

    def test_unresolved_parent_raises(self):
        with self.assertRaises(ValueError) as ctx:
            self.build([node_row("Orphan", "1", "MQMC-O", "orphan", "ghost")])
        self.assertIn("ghost", str(ctx.exception))


class TestRenderHtml(unittest.TestCase):
    NODES = [{"name": "X", "desc": "", "ex": "", "level": "0", "pid": "MQMC-X", "id": "x", "parent": ""}]

    def test_real_template_fills_all_placeholders(self):
        html = render_html(self.NODES)
        self.assertNotIn("__DATA__", html)
        self.assertNotIn("__SCRIPTS__", html)
        self.assertIn('"pid": "MQMC-X"', html)  # injected JSON
        for marker in ("guidelineSections", "makeZip", "renderPanel"):  # one per asset file
            self.assertIn(marker, html)

    def test_assets_inline_in_declared_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "template.html").write_text("<A>__SCRIPTS__</A><B>__DATA__</B>", encoding="utf-8")
            assets = d / "assets"
            assets.mkdir()
            for name in ("export-formats.js", "docx.js", "app.js"):
                (assets / name).write_text(f"/*{name}*/", encoding="utf-8")
            html = render_html([], d / "template.html", assets)
            self.assertEqual(
                html,
                "<A>/*export-formats.js*/\n/*docx.js*/\n/*app.js*/</A><B>[]</B>",
            )


class TestDownloadSpreadsheet(unittest.TestCase):
    def test_existing_file_short_circuits_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "sheet.xlsx"
            dest.write_bytes(b"cached")
            out = download_spreadsheet(dest, url="https://invalid.example/never-fetched")
            self.assertEqual(out, dest)
            self.assertEqual(dest.read_bytes(), b"cached")


if __name__ == "__main__":
    unittest.main()
