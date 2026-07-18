/*
 * Minimal .docx writer, no external libraries.
 *
 * toDocx(sections) takes the structure produced by guidelineSections() and
 * returns the bytes (Uint8Array) of a valid .docx: the OOXML package parts
 * ([Content_Types].xml, _rels/.rels, word/document.xml) zipped by a small
 * store-only (no compression) ZIP writer with CRC32. Depth is expressed with
 * indentation (w:ind) and manual numbering strings — no numbering.xml.
 * No DOM, no globals — this file also runs under Node for the unit tests.
 */

function xmlEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function docxRun(text, opts) {
  opts = opts || {}; const rp = [];
  if (opts.bold) rp.push("<w:b/>");
  if (opts.italic) rp.push("<w:i/>");
  if (opts.sz) { rp.push('<w:sz w:val="' + opts.sz + '"/><w:szCs w:val="' + opts.sz + '"/>'); }
  const rpr = rp.length ? "<w:rPr>" + rp.join("") + "</w:rPr>" : "";
  const t = xmlEsc(text).replace(/\r\n?|\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
  return "<w:r>" + rpr + '<w:t xml:space="preserve">' + t + "</w:t></w:r>";
}
function docxPara(runs, indent) {
  const ind = indent ? '<w:ind w:left="' + indent + '"/>' : "";
  return "<w:p><w:pPr>" + ind + '<w:spacing w:after="80"/></w:pPr>' + runs + "</w:p>";
}

function docxDocumentXml(sections) {
  const body = [];
  function walk(items, prefix, depth) {
    items.forEach((w, i) => {
      const num = prefix ? prefix + "." + (i + 1) : String(i + 1);
      const n = w.node, pid = (n.pid || "").trim();
      const base = 360 * (depth + 1);
      let head = docxRun(num + (n.name ? "  " + n.name : ""), { bold: true, sz: 24 });
      if (pid) head += docxRun("  " + pid, { sz: 24 });
      body.push(docxPara(head, base));
      if (n.desc) body.push(docxPara(docxRun(n.desc, { sz: 22 }), base + 240));
      if (n.ex) body.push(docxPara(docxRun("Examples: ", { bold: true, sz: 22 }) + docxRun(n.ex, { sz: 22 }), base + 240));
      walk(w.children, num, depth + 1);
    });
  }
  sections.forEach(sec => {
    body.push(docxPara(docxRun(sec.name, { bold: true, sz: 32 }), 0));
    if (sec.intro) {
      const n = sec.intro, pid = (n.pid || "").trim();
      if (pid) body.push(docxPara(docxRun(pid, { italic: true, sz: 22 }), 240));
      if (n.desc) body.push(docxPara(docxRun(n.desc, { sz: 22 }), 240));
      if (n.ex) body.push(docxPara(docxRun("Examples: ", { bold: true, sz: 22 }) + docxRun(n.ex, { sz: 22 }), 240));
    }
    walk(sec.roots, "", 0);
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + body.join("")
    + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>';
}

// ---- store-only ZIP writer ----
function crc32(bytes) {
  let c = ~0 >>> 0;
  for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) { c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } }
  return (~c) >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder(), parts = []; let offset = 0;
  const push = b => { parts.push(b); offset += b.length; };
  const u16 = n => new Uint8Array([n & 255, (n >> 8) & 255]);
  const u32 = n => { n >>>= 0; return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]); };
  const central = [];
  files.forEach(f => {
    const name = enc.encode(f.name), data = (f.data instanceof Uint8Array) ? f.data : enc.encode(f.data);
    const crc = crc32(data), local = offset;
    push(u32(0x04034b50)); push(u16(20)); push(u16(0)); push(u16(0));
    push(u16(0)); push(u16(0)); push(u32(crc)); push(u32(data.length)); push(u32(data.length));
    push(u16(name.length)); push(u16(0)); push(name); push(data);
    central.push({ name, crc, size: data.length, local });
  });
  const cdStart = offset;
  central.forEach(c => {
    push(u32(0x02014b50)); push(u16(20)); push(u16(20)); push(u16(0)); push(u16(0));
    push(u16(0)); push(u16(0)); push(u32(c.crc)); push(u32(c.size)); push(u32(c.size));
    push(u16(c.name.length)); push(u16(0)); push(u16(0)); push(u16(0)); push(u16(0));
    push(u32(0)); push(u32(c.local)); push(c.name);
  });
  const cdSize = offset - cdStart;
  push(u32(0x06054b50)); push(u16(0)); push(u16(0)); push(u16(central.length)); push(u16(central.length));
  push(u32(cdSize)); push(u32(cdStart)); push(u16(0));
  let total = 0; parts.forEach(p => total += p.length);
  const out = new Uint8Array(total); let p = 0; parts.forEach(b => { out.set(b, p); p += b.length; });
  return out;
}

function toDocx(sections) {
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';
  return makeZip([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: docxDocumentXml(sections) },
  ]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { xmlEsc, docxRun, docxPara, docxDocumentXml, crc32, makeZip, toDocx };
}
