"""Step 3 of the build: render the nodes into the self-contained HTML page.

The page source is split for development — ``template.html`` (markup + CSS) and
``assets/*.js`` (page logic and export formatters) — but the build inlines
everything into a single file, so the shipped ``dist/index.html`` stays fully
self-contained.
"""

from __future__ import annotations

import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TEMPLATE = _ROOT / "template.html"
DEFAULT_ASSETS_DIR = _ROOT / "assets"

# Inlined in this order: the formatters and the docx writer define plain
# top-level functions that app.js then calls.
_ASSET_ORDER = ("export-formats.js", "docx.js", "app.js")


def render_html(
    nodes: list[dict],
    template_path: Path = DEFAULT_TEMPLATE,
    assets_dir: Path = DEFAULT_ASSETS_DIR,
) -> str:
    """Inline the JS assets and ``nodes`` (as JSON) into the template's
    ``__SCRIPTS__`` and ``__DATA__`` placeholders."""
    template = Path(template_path).read_text(encoding="utf-8")
    scripts = "\n".join(
        (Path(assets_dir) / name).read_text(encoding="utf-8") for name in _ASSET_ORDER
    )
    html = template.replace("__SCRIPTS__", scripts)
    return html.replace("__DATA__", json.dumps(nodes, ensure_ascii=False))
