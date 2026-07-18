/*
 * Unit tests for the export formatters (assets/export-formats.js) and the
 * dependency-free .docx writer (assets/docx.js). Run with:
 *
 *     node --test tests/
 *
 * No packages needed — node:test ships with Node, and the ZIP/CRC checks use
 * node:zlib as an independent CRC32 implementation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const { toCSV, toJSON, guidelineSections, texEsc, toLaTeX } = require("../assets/export-formats.js");
const { toDocx, docxDocumentXml, makeZip } = require("../assets/docx.js");

// Two dimensions; accuracy has a 3-deep chain plus a sibling. Strings include
// LaTeX/XML specials on purpose.
const DATA = [
  { name: "Accuracy", desc: "Meaning & transfer", ex: "", level: "0", pid: "MQMC-A", id: "accuracy", parent: "" },
  { name: "Mistranslation", desc: "Wrong meaning 100% $ & _ {x}", ex: "src<tgt\nline2", level: "1", pid: "MQMC-001", id: "mistranslation", parent: "accuracy" },
  { name: "Overly literal", desc: "too literal ~ ^ # \\", ex: "word for word", level: "2", pid: "MQMC-002", id: "overly-literal", parent: "mistranslation" },
  { name: "Terminology", desc: "term issues", ex: "", level: "1", pid: "MQMN-010", id: "terminology", parent: "accuracy" },
  { name: "Fluency", desc: "form", ex: "", level: "0", pid: "MQMC-F", id: "fluency", parent: "" },
  { name: "Grammar", desc: "grammar issues", ex: "bad tense", level: "1", pid: "MQMC-100", id: "grammar", parent: "fluency" },
];
const ALL = new Set(DATA.map(d => d.id));

test("texEsc escapes every LaTeX special", () => {
  assert.equal(
    texEsc("\\ { } $ & # ^ _ % ~"),
    "\\textbackslash{} \\{ \\} \\$ \\& \\# \\textasciicircum{} \\_ \\% \\textasciitilde{}"
  );
});

test("toCSV quotes cells containing commas, quotes or newlines", () => {
  const csv = toCSV(DATA, new Set(["mistranslation"]));
  const lines = csv.split("\n");
  assert.equal(lines[0], "pid,id,name,level,core,parent,description,examples");
  assert.ok(csv.includes('"src<tgt\nline2"'), "multi-line example must be quoted");
});

test("toJSON emits one object per selected node with the core flag", () => {
  const arr = JSON.parse(toJSON(DATA, new Set(["terminology", "grammar"])));
  assert.deepEqual(arr.map(o => [o.id, o.core]), [["terminology", false], ["grammar", true]]);
});

test("guidelineSections nests under the nearest selected ancestor", () => {
  // mistranslation is NOT selected, so overly-literal must attach to accuracy's top level
  const secs = guidelineSections(DATA, new Set(["overly-literal", "terminology"]));
  assert.equal(secs.length, 1);
  assert.equal(secs[0].name, "Accuracy");
  assert.equal(secs[0].intro, null);
  assert.deepEqual(secs[0].roots.map(w => w.node.id), ["overly-literal", "terminology"]);
});

test("guidelineSections lifts a selected dimension into the section intro", () => {
  const secs = guidelineSections(DATA, new Set(["accuracy", "mistranslation", "overly-literal"]));
  assert.equal(secs.length, 1);
  assert.equal(secs[0].intro.id, "accuracy", "dimension becomes the intro, not a numbered entry");
  assert.deepEqual(secs[0].roots.map(w => w.node.id), ["mistranslation"]);
  assert.deepEqual(secs[0].roots[0].children.map(w => w.node.id), ["overly-literal"]);
});

test("toLaTeX renders name-first bold entries and no duplicated dimension title", () => {
  const tex = toLaTeX(DATA, ALL);
  assert.ok(tex.startsWith("\\documentclass{article}"));
  assert.ok(tex.includes("\\section*{Accuracy}"));
  assert.ok(tex.includes("\\item \\textbf{Mistranslation} --- MQMC-001"), "name leads, PID follows");
  assert.ok(!tex.includes("\\item \\textbf{Accuracy}"), "selected dimension must not repeat as an entry");
  assert.ok(tex.includes("\\textit{MQMC-A}"), "dimension PID appears as intro");
  const opens = (tex.match(/\\begin\{enumerate\}/g) || []).length;
  const closes = (tex.match(/\\end\{enumerate\}/g) || []).length;
  assert.equal(opens, closes);
  assert.equal(opens, 3, "accuracy list + nested overly-literal list + fluency list");
});

test("document.xml carries numbering strings, indentation and escaped text", () => {
  const xml = docxDocumentXml(guidelineSections(DATA, ALL));
  assert.ok(xml.includes(">1.1  Overly literal<"), "nested manual numbering");
  assert.ok(xml.includes('<w:ind w:left="720"/>'), "depth-1 indentation");
  assert.ok(xml.includes("Wrong meaning 100% $ &amp; _ {x}"), "XML-escaped description");
  assert.ok(xml.includes("src&lt;tgt</w:t><w:br/>"), "newline becomes w:br");
});

// Minimal independent ZIP reader: walk local file headers, extract the stored
// data and verify each CRC against node:zlib's implementation.
function readZip(bytes) {
  const buf = Buffer.from(bytes);
  const entries = [];
  let off = 0;
  while (buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const crc = buf.readUInt32LE(off + 14);
    const csize = buf.readUInt32LE(off + 18);
    const usize = buf.readUInt32LE(off + 22);
    const nlen = buf.readUInt16LE(off + 26);
    const elen = buf.readUInt16LE(off + 28);
    const name = buf.toString("utf8", off + 30, off + 30 + nlen);
    const data = buf.subarray(off + 30 + nlen + elen, off + 30 + nlen + elen + csize);
    entries.push({ name, method, crc, csize, usize, data });
    off += 30 + nlen + elen + csize;
  }
  return { entries, centralAt: off };
}

test("makeZip produces store-only entries with correct CRC32 (vs node:zlib)", () => {
  const zip = makeZip([{ name: "a.txt", data: "hello" }, { name: "b/c.xml", data: "<x>&amp;</x>" }]);
  const { entries } = readZip(zip);
  assert.deepEqual(entries.map(e => e.name), ["a.txt", "b/c.xml"]);
  for (const e of entries) {
    assert.equal(e.method, 0, e.name + " must be stored, not deflated");
    assert.equal(e.csize, e.usize);
    assert.equal(e.crc, zlib.crc32(e.data) >>> 0, e.name + " CRC mismatch");
  }
});

test("toDocx builds the three OOXML parts with valid CRCs and an EOCD record", () => {
  const bytes = toDocx(guidelineSections(DATA, ALL));
  const { entries, centralAt } = readZip(bytes);
  assert.deepEqual(entries.map(e => e.name), ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  for (const e of entries) assert.equal(e.crc, zlib.crc32(e.data) >>> 0, e.name + " CRC mismatch");
  const buf = Buffer.from(bytes);
  assert.equal(buf.readUInt32LE(centralAt), 0x02014b50, "central directory follows the entries");
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50, "end-of-central-directory record");
  assert.equal(buf.readUInt16LE(buf.length - 22 + 10), 3, "EOCD entry count");
});
