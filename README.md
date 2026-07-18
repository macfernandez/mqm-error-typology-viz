# MQM-Core Error Typology — interactive explorer

[![Deploy to GitHub Pages](https://github.com/macfernandez/mqm-error-typology-viz/actions/workflows/pages.yml/badge.svg)](https://github.com/macfernandez/mqm-error-typology-viz/actions/workflows/pages.yml)
[![Tests (branch)](https://img.shields.io/github/actions/workflow/status/macfernandez/mqm-error-typology-viz/tests.yml?branch=claude%2Fmqm-export-menu-formats-4mo4h6&label=tests%20%28branch%29)](https://github.com/macfernandez/mqm-error-typology-viz/actions/workflows/tests.yml?query=branch%3Aclaude%2Fmqm-export-menu-formats-4mo4h6)
[![Tests](https://github.com/macfernandez/mqm-error-typology-viz/actions/workflows/tests.yml/badge.svg)](https://github.com/macfernandez/mqm-error-typology-viz/actions/workflows/tests.yml)
[![Live demo](https://img.shields.io/badge/demo-live-brightgreen)](https://macfernandez.github.io/mqm-error-typology-viz/)
[![Python 3.13+](https://img.shields.io/badge/python-3.13%2B-blue)](pyproject.toml)
[![uv](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json)](https://docs.astral.sh/uv/)
[![No runtime dependencies](https://img.shields.io/badge/dependencies-none-success)](pyproject.toml)
[![Content license: CC BY 4.0](https://img.shields.io/badge/content%20license-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

A self-contained, interactive HTML view of the [MQM-Core](https://themqm.org/) translation-quality
error typology. Browse the typology as a collapsible tree, inspect each error type, and tick the
ones you want to keep (for example, to build an annotation guideline) — then export your selection
to CSV or JSON.

🔗 **Live version:** <https://macfernandez.github.io/mqm-error-typology-viz/>

## What it does

The build is a three-step flow, each step a reusable function in
[`src/mqm_viz`](src/mqm_viz/__init__.py):

1. **Download** the official MQM-Full spreadsheet from <https://themqm.org/downloads/>.
2. **Parse** the `MQMFull Master` sheet into a JSON tree — standard library only, no
   `openpyxl`/`pandas` (an `.xlsx` is just a zip of XML).
3. **Render** the tree into a single self-contained HTML file by inlining the JSON and the
   [`assets/*.js`](assets/) sources into [`template.html`](template.html) (the page's only
   external dependency is D3, loaded from a CDN).

The interactive HTML lets you:

- Browse the typology as a collapsible tree — **node color = error level** (dimension → N1 → N2 →
  N3), **filled vs. outline = Core vs. Extension**.
- Hover a node for its description, examples, identifier (PID) and Core/Extension label.
- **Tick** any node to add it to a selection, grouped by dimension and persisted across reloads
  (`localStorage`).
- **Filter** with All / Core only / Selected.
- **Export** the selection from a single Export menu: CSV and JSON (flat dumps), or LaTeX
  (`.tex`) and Word (`.docx`) as a nested guideline document grouped by dimension.

## Repository layout

| Path | What it is |
|---|---|
| [`src/mqm_viz/`](src/mqm_viz/) | Reusable package, one module per build step: `download.py`, `parse.py`, `render.py`. Standard library only. |
| [`template.html`](template.html) | The page's markup + CSS, with `__DATA__` / `__SCRIPTS__` placeholders filled by the build. |
| [`assets/`](assets/) | The page's JS: `export-formats.js` (pure formatters), `docx.js` (dependency-free `.docx` writer), `app.js` (tree + UI). Inlined into the template at build time. |
| [`build.py`](build.py) | Thin script that runs the three steps → `dist/index.html`. Used by CI and locally. |
| [`tests/`](tests/) | Unit tests: `exports.test.js` for the JS formatters (`node --test`), `test_mqm_viz.py` for the Python package (`unittest`). |
| [`notebooks/`](notebooks/) | Narrative notebook that walks through the same module, step by step. |
| [`.github/workflows/pages.yml`](.github/workflows/pages.yml) | Builds and deploys to GitHub Pages on every push to `main`. |

Both the CI build and the notebook call into the same module, so there is no duplicated logic.

## Usage

The project uses [uv](https://docs.astral.sh/uv/). The build itself has **no runtime
dependencies** (standard library only); the notebook extra just adds JupyterLab.

### Build the explorer locally

```bash
uv run build.py            # -> dist/index.html
uv run build.py --force    # re-download the spreadsheet
```

Open `dist/index.html` in any browser. Intermediate files (spreadsheet, JSON) go to `build/`;
both `build/` and `dist/` are git-ignored and regenerated on each run.

### Run the tests

Both suites are dependency-free, matching the project itself. The CSV/JSON/LaTeX/DOCX
formatters in [`assets/`](assets/) are pure functions, so they run under Node as-is (no npm
packages); the Python tests cover the parser (against synthetic `.xlsx` fixtures built with
`zipfile`), the renderer and the download short-circuit, using only `unittest`:

```bash
node --test                                    # JS export formatters + docx writer
uv run python -m unittest discover -s tests    # mqm_viz package
```

Both run in CI on every push ([`tests.yml`](.github/workflows/tests.yml)).

### Run the narrative notebook

```bash
uv sync --extra notebook
uv run jupyter lab notebooks/mqm_error_typology.ipynb
```

### Deploy to GitHub Pages

Pushing to `main` triggers [`pages.yml`](.github/workflows/pages.yml), which runs `build.py` and
publishes `dist/` to GitHub Pages. Enable it once under **Settings → Pages → Build and deployment
→ Source: GitHub Actions**.

## Attribution and license

The typology shown here is the **MQM Error Typology** (MQM-Core), © **The MQM Council**, published
at <https://themqm.org> and obtained from the MQM-Full spreadsheet at
<https://themqm.org/downloads/>. MQM materials are licensed under the **Creative Commons
Attribution 4.0 International License (CC BY 4.0)** —
<https://creativecommons.org/licenses/by/4.0/>.

**Changes from the source** (as required by CC BY 4.0): the typology is reshaped into a JSON tree
for visualization; two typo'd *parent* references are corrected (`locale-convention` →
`locale-conventions`, `locale-specific-punctuation` → `locale-specific punctuation`); and a
`Core` / `Extension` flag is derived from the PID prefix (`MQMC` = Core, `MQMN` = Extension). This
attribution is also embedded in the generated HTML.

This explorer is an independent adaptation and is **not endorsed by, nor affiliated with, The MQM
Council**.
