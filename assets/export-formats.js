/*
 * Pure export formatters for the MQM explorer.
 *
 * Every entry point takes (data, selectedIds): the full node list in document
 * order and a Set of selected node ids. No DOM, no globals — this file also
 * runs under Node for the unit tests in tests/.
 */

const isCoreData = n => String((n && n.pid) || "").startsWith("MQMC");

function selectedNodes(data, selectedIds) {
  return data.filter(d => selectedIds.has(d.id));
}

// ---- CSV / JSON (flat dumps) ----
function csvCell(s) {
  s = String(s == null ? "" : s);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(data, selectedIds) {
  const cols = ["pid", "id", "name", "level", "core", "parent", "description", "examples"];
  const head = cols.join(",");
  const rows = selectedNodes(data, selectedIds)
    .map(n => [n.pid, n.id, n.name, n.level, isCoreData(n) ? "core" : "extension", n.parent, n.desc, n.ex]
      .map(csvCell).join(","));
  return [head, ...rows].join("\n");
}
function toJSON(data, selectedIds) {
  return JSON.stringify(selectedNodes(data, selectedIds).map(n => ({
    pid: n.pid, id: n.id, name: n.name, level: n.level,
    core: isCoreData(n), parent: n.parent, description: n.desc, examples: n.ex,
  })), null, 2);
}

// ---- nested guideline structure (shared by LaTeX / DOCX) ----
// Only selected nodes, grouped by top-level dimension, each nested under its
// nearest SELECTED ancestor (else at the dimension's top level). `data` order
// gives stable ordering.
function guidelineSections(data, selectedIds) {
  const byId = new Map(data.map(d => [d.id, d]));
  const rootOf = id => { let n = byId.get(id); while (n && n.parent && byId.get(n.parent)) n = byId.get(n.parent); return n; };
  const nearestSelAnc = n => { let p = n.parent ? byId.get(n.parent) : null; while (p) { if (selectedIds.has(p.id)) return p; p = p.parent ? byId.get(p.parent) : null; } return null; };
  const wrap = new Map();
  data.forEach(d => { if (selectedIds.has(d.id)) wrap.set(d.id, { node: d, children: [] }); });
  const sections = new Map(); // dimId -> {name,intro,roots}
  data.forEach(d => {
    if (!selectedIds.has(d.id)) return;
    const w = wrap.get(d.id), anc = nearestSelAnc(d);
    if (anc) { wrap.get(anc.id).children.push(w); }
    else {
      const dim = rootOf(d.id) || d;
      if (!sections.has(dim.id)) sections.set(dim.id, { name: dim.name, intro: null, roots: [] });
      sections.get(dim.id).roots.push(w);
    }
  });
  const ordered = [];
  data.filter(d => !d.parent).forEach(dim => {
    if (!sections.has(dim.id)) return;
    const sec = sections.get(dim.id);
    // When the dimension node itself is selected it already serves as the section
    // header, so lift its definition/examples into an intro and promote its children
    // to the top level — the dimension name isn't repeated as a numbered entry.
    if (sec.roots.length === 1 && sec.roots[0].node.id === dim.id) { sec.intro = sec.roots[0].node; sec.roots = sec.roots[0].children; }
    ordered.push(sec);
  });
  return ordered;
}

// ---- LaTeX ----
function texEsc(s) {
  const map = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#", "^": "\\textasciicircum{}", "_": "\\_", "%": "\\%", "~": "\\textasciitilde{}" };
  return String(s == null ? "" : s).replace(/[\\{}$&#^_%~]/g, ch => map[ch]);
}
function toLaTeX(data, selectedIds) {
  const L = [];
  L.push("\\documentclass{article}");
  L.push("\\renewcommand{\\labelenumii}{\\theenumi.\\theenumii}");
  L.push("\\renewcommand{\\labelenumiii}{\\theenumi.\\theenumii.\\theenumiii}");
  L.push("\\renewcommand{\\labelenumiv}{\\theenumi.\\theenumii.\\theenumiii.\\theenumiv}");
  L.push("\\begin{document}");
  L.push("");
  function renderList(items) {
    if (!items.length) return;
    L.push("\\begin{enumerate}");
    items.forEach(w => {
      const n = w.node, pid = (n.pid || "").trim();
      let head = "\\item ";
      if (n.name && pid) head += "\\textbf{" + texEsc(n.name) + "} --- " + texEsc(pid);
      else if (n.name) head += "\\textbf{" + texEsc(n.name) + "}";
      else head += texEsc(pid);
      L.push(head);
      if (n.desc) { L.push(""); L.push(texEsc(n.desc)); }
      if (n.ex) { L.push(""); L.push("\\textit{Examples:} " + texEsc(n.ex)); }
      if (w.children.length) { L.push(""); renderList(w.children); }
    });
    L.push("\\end{enumerate}");
  }
  guidelineSections(data, selectedIds).forEach(sec => {
    L.push("\\section*{" + texEsc(sec.name) + "}");
    if (sec.intro) {
      const n = sec.intro, pid = (n.pid || "").trim();
      if (pid) { L.push(""); L.push("\\textit{" + texEsc(pid) + "}"); }
      if (n.desc) { L.push(""); L.push(texEsc(n.desc)); }
      if (n.ex) { L.push(""); L.push("\\textit{Examples:} " + texEsc(n.ex)); }
    }
    L.push("");
    renderList(sec.roots);
    L.push("");
  });
  L.push("\\end{document}");
  L.push("");
  return L.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isCoreData, selectedNodes, csvCell, toCSV, toJSON, guidelineSections, texEsc, toLaTeX };
}
