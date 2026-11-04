'use strict';
/* ═══════════════════════════════════════════════════════════
   StageDocx — bouwt een echt Word-bestand (.docx) in de browser.
   Geen externe libraries: eigen OOXML + ZIP-schrijver, werkt offline.
   ═══════════════════════════════════════════════════════════ */
(function () {
  // ── ZIP (store, geen compressie) ─────────────────────────
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function zip(files, type) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const dTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dTime, true); lh.setUint16(12, dDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dTime, true); ch.setUint16(14, dDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
  }

  // ── OOXML helpers ────────────────────────────────────────
  const x = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const PAGE_W = 9638; // A4 (11906) − 2 × 1134 marge

  function r(text, o = {}) {
    const p = [];
    if (o.font) p.push(`<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>`);
    if (o.b) p.push('<w:b/><w:bCs/>');
    if (o.i) p.push('<w:i/><w:iCs/>');
    if (o.caps) p.push('<w:caps/>');
    if (o.color) p.push(`<w:color w:val="${o.color}"/>`);
    if (o.spacing) p.push(`<w:spacing w:val="${o.spacing}"/>`);
    if (o.size) p.push(`<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`);
    if (o.shade) p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`);
    return `<w:r>${p.length ? `<w:rPr>${p.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
  }
  const br = () => '<w:r><w:br/></w:r>';

  function p(runs, o = {}) {
    const q = [];
    if (o.style) q.push(`<w:pStyle w:val="${o.style}"/>`);
    if (o.keepNext) q.push('<w:keepNext/>');
    if (o.keepLines) q.push('<w:keepLines/>');
    if (o.pageBreakBefore) q.push('<w:pageBreakBefore/>');
    if (o.numId) q.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.numId}"/></w:numPr>`);
    if (o.border) q.push(`<w:pBdr><w:bottom w:val="single" w:sz="${o.border.sz || 12}" w:space="${o.border.space ?? 4}" w:color="${o.border.color}"/></w:pBdr>`);
    if (o.tabRight) q.push(`<w:tabs><w:tab w:val="right" w:pos="${o.tabRight}"/></w:tabs>`);
    if (o.before != null || o.after != null || o.line) q.push(`<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 80}"${o.line ? ` w:line="${o.line}" w:lineRule="auto"` : ''}/>`);
    if (o.align) q.push(`<w:jc w:val="${o.align}"/>`);
    return `<w:p>${q.length ? `<w:pPr>${q.join('')}</w:pPr>` : ''}${Array.isArray(runs) ? runs.join('') : (runs || '')}</w:p>`;
  }

  // cel: { c: xml-inhoud (paragrafen) of tekst, fill, w, span, vAlign }
  function table(rows, o = {}) {
    const widths = o.widths;
    const total = widths.reduce((a, b) => a + b, 0);
    const bc = o.borderColor || 'DCDCE8';
    const bd = o.noBorders
      ? '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'
      : `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${bc}"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${bc}"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${bc}"/><w:insideV w:val="nil"/></w:tblBorders>`;
    const pad = o.pad ?? 90;
    const tblPr = `<w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${pad}" w:type="dxa"/><w:left w:w="${o.padX ?? 120}" w:type="dxa"/><w:bottom w:w="${pad}" w:type="dxa"/><w:right w:w="${o.padX ?? 120}" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>`;
    const grid = `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    const trs = rows.map((row, ri) => {
      const isHead = o.header && ri === 0;
      const trPr = `<w:trPr><w:cantSplit/>${row.height ? `<w:trHeight w:val="${row.height}" w:hRule="atLeast"/>` : ''}${isHead ? '<w:tblHeader/>' : ''}</w:trPr>`;
      let col = 0;
      const cells = (row.cells || row).map(cell => {
        const c = typeof cell === 'object' && cell !== null && !Array.isArray(cell) ? cell : { c: cell };
        const span = c.span || 1;
        const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
        col += span;
        const fill = c.fill || (o.zebra && !isHead && ri % 2 === 0 ? o.zebra : null);
        const tcPr = `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="${c.vAlign || 'center'}"/></w:tcPr>`;
        let content = c.c ?? '';
        if (!String(content).trim().startsWith('<w:p') && !String(content).trim().startsWith('<w:tbl')) content = p(r(content, c.r || {}), { after: 0, align: c.align });
        return `<w:tc>${tcPr}${content}</w:tc>`;
      }).join('');
      return `<w:tr>${trPr}${cells}</w:tr>`;
    }).join('');
    return `<w:tbl>${tblPr}${grid}${trs}</w:tbl>`;
  }

  // tekst met **vet**-labels (Probleem:, Oplossing: …) en `code`
  function rich(text, labelColors, base = {}) {
    const out = [];
    const re = /(`[^`]+`)|\b(Probleem|Fout|Oorzaak|Oplossing|Geleerd|Leerpunt):/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(r(text.slice(last, m.index), base));
      if (m[1]) out.push(r(m[1].slice(1, -1), { ...base, font: 'Consolas', shade: 'F1F1F6', size: 19 }));
      else out.push(r(m[2] + ':', { ...base, b: true, color: labelColors[m[2]] || base.color }));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(r(text.slice(last), base));
    return out;
  }

  // ── document opbouwen ────────────────────────────────────
  function build(rep) {
    const C = rep.colors; // { p, s, bright, dark, light }
    const SEC = { wie: C.s, planning: C.s, taken: C.p, materiaal: C.s, fouten: 'B91C1C', geleerd: '047857', meenemen: 'B45309' };
    const LABELS = { Probleem: 'B91C1C', Fout: 'B91C1C', Oorzaak: 'C2410C', Oplossing: 'B45309', Geleerd: '047857', Leerpunt: '047857' };
    const secKeys = rep.listFields.map(f => f.key);
    const numIds = Object.fromEntries(secKeys.map((k, i) => [k, i + 2])); // 1 = algemeen
    const GRAY = '6B6F80';
    const body = [];
    const h1 = (text, o = {}) => p(r(text), { style: 'Heading1', pageBreakBefore: o.pageBreak, border: { color: C.p, sz: 12, space: 6 }, after: 160 });
    const h2 = (text, color) => p([r('■  ', { color, size: 16 }), r(text, { color })], { style: 'Heading2' });
    const bullet = (runs, numId = 1) => p(runs, { numId, after: 50 });
    const spacer = (after = 120) => p('', { after });

    // ── voorpagina
    const coverContent =
      p(r('❯_ STAGELOG TERMINAL', { font: 'Consolas', color: C.bright, size: 18, b: true, spacing: 20 }), { before: 400, after: 0 }) +
      p(r('STAGELOGBOEK', { b: true, color: 'FFFFFF', size: 72, spacing: 30 }), { before: 900, after: 60 }) +
      p(r('━━━━━━━━━━━━━━━━', { color: C.bright, size: 24 }), { after: 160 }) +
      p(r(rep.opleiding || 'Podiumtechnieken — Licht', { color: C.bright, size: 32, b: true }), { after: 60 }) +
      p(r(rep.name || '', { color: 'FFFFFF', size: 30 }), { after: 900 });
    body.push(table([[{ c: coverContent, fill: C.dark, vAlign: 'top' }]], { widths: [PAGE_W], noBorders: true, padX: 500, pad: 0 }));
    body.push(spacer(400));

    const info = [
      ['Stagiair', rep.name], ['Opleiding', rep.opleiding], ['Stageplek', rep.stageplek], ['Stagebegeleider', rep.mentor],
      ['Periode', `${rep.periodText}`], ['Aantal logdagen', String(rep.days.length)], ['Totaal gewerkte uren', rep.totals.hoursText],
    ].filter(([, v]) => v);
    body.push(table(info.map(([k, v]) => [
      { c: p(r(k.toUpperCase(), { b: true, color: GRAY, size: 16, spacing: 20 }), { after: 0 }) },
      { c: p(r(v, { b: true, size: 22 }), { after: 0 }) },
    ]), { widths: [3000, PAGE_W - 3000], pad: 110 }));
    body.push(spacer(1400));
    body.push(p(r(`Gegenereerd op ${rep.generated} met StageLog Terminal`, { color: GRAY, size: 16, i: true }), { align: 'right' }));

    // ── overzicht
    body.push(h1('Overzicht', { pageBreak: true }));
    const stat = (n, l) => ({ c: p(r(n, { b: true, size: 40, color: C.p }), { after: 0, align: 'center' }) + p(r(l.toUpperCase(), { size: 15, color: GRAY, b: true, spacing: 20 }), { after: 0, align: 'center' }), fill: C.light });
    const qw = Math.floor(PAGE_W / 4);
    body.push(table([[
      stat(String(rep.days.length), 'logdagen'), stat(rep.totals.hoursText, 'uren'),
      stat(String(rep.totals.taken), 'taken'), stat(String(rep.totals.geleerd), 'leerpunten'),
    ]], { widths: [qw, qw, qw, PAGE_W - 3 * qw], noBorders: true, pad: 160 }));
    body.push(spacer(80));

    if (rep.producties.length) {
      body.push(h2('Producties', C.p));
      rep.producties.forEach(([name, n]) => body.push(bullet([r(name, { b: true }), r(`  —  ${n} dag${n > 1 ? 'en' : ''}`, { color: GRAY })], numIds.taken)));
    }
    if (rep.materiaal.length) {
      body.push(h2('Materiaal & techniek waarmee ik werkte', C.s));
      body.push(p(r(rep.materiaal.join('  ·  ')), { after: 120 }));
    }

    body.push(h2('Dagoverzicht', C.p));
    const ow = [1900, 3300, 2738, 1700];
    body.push(table([
      ['Datum', 'Productie', 'Locatie', 'Uren'].map(t => ({ c: p(r(t.toUpperCase(), { b: true, color: 'FFFFFF', size: 16, spacing: 20 }), { after: 0 }), fill: C.p })),
      ...rep.days.map(d => [d.short, d.e.productie || '—', d.e.locatie || '—', d.hoursText || d.e.uren || '—'].map(t => ({ c: p(r(t, { size: 19 }), { after: 0 }) }))),
    ], { widths: ow, header: true, zebra: 'F6F5FB' }));

    // ── samenvatting (optioneel, AI)
    if (rep.summary) {
      body.push(h1('Samenvatting', { pageBreak: true }));
      for (const raw of rep.summary.split('\n')) {
        const line = raw.trim().replace(/\*\*/g, '');
        if (!line) continue;
        const head = line.match(/^([A-ZÀ-Ý0-9 &/'’-]{4,}?)\s*(?:[—:–-]\s*(.*))?$/);
        if (head && head[1] === head[1].toUpperCase() && /[A-Z]{3}/.test(head[1])) {
          body.push(h2(head[1].trim().replace(/^./, c => c.toUpperCase()), C.p));
          if (head[2]) body.push(p(r(head[2]), { after: 80 }));
        } else if (/^[-•*]\s+/.test(line)) body.push(bullet(rich(line.replace(/^[-•*]\s+/, ''), LABELS), numIds.taken));
        else body.push(p(rich(line, LABELS), { after: 80 }));
      }
    }

    // ── de dagen
    rep.days.forEach((d, i) => {
      body.push(h1(d.title, { pageBreak: true }));
      body.push(p([r(`DAG ${i + 1}`, { b: true, color: C.p, size: 16, spacing: 30 }), r(`   ·   ${d.date}${d.hoursText ? `   ·   ${d.hoursText} gewerkt` : ''}`, { color: GRAY, size: 16 })], { after: 160 }));
      const meta = rep.textFields.filter(f => d.e[f.key]);
      if (meta.length) {
        const w = Math.floor(PAGE_W / meta.length);
        body.push(table([meta.map((f, j) => ({
          c: p(r(f.title.toUpperCase(), { b: true, size: 15, color: C.p, spacing: 20 }), { after: 20 }) + p(r(d.e[f.key], { b: true, size: 21 }), { after: 0 }),
          fill: C.light, w: j === meta.length - 1 ? PAGE_W - w * (meta.length - 1) : w,
        }))], { widths: meta.map((_, j) => j === meta.length - 1 ? PAGE_W - w * (meta.length - 1) : w), noBorders: true, pad: 120, padX: 160 }));
      }
      for (const f of rep.listFields) {
        const items = d.e[f.key];
        if (!items.length && !f.required) continue;
        body.push(h2(f.title, SEC[f.key]));
        if (!items.length) body.push(p(r('— niets ingevuld —', { i: true, color: GRAY })));
        items.forEach(t => body.push(bullet(rich(t, LABELS), numIds[f.key])));
      }
    });

    // ── urenoverzicht + ondertekening
    body.push(h1('Urenoverzicht', { pageBreak: true }));
    const uw = [2100, 3600, 2238, 1700];
    body.push(table([
      ['Datum', 'Productie', 'Werkuren', 'Duur'].map(t => ({ c: p(r(t.toUpperCase(), { b: true, color: 'FFFFFF', size: 16, spacing: 20 }), { after: 0 }), fill: C.p })),
      ...rep.days.map(d => [d.short, d.e.productie || '—', d.e.uren || '—', d.hoursText || '—'].map(t => ({ c: p(r(t, { size: 19 }), { after: 0 }) }))),
      [{ c: p(r('TOTAAL', { b: true, size: 18, spacing: 20 }), { after: 0 }), span: 3, fill: C.light }, { c: p(r(rep.totals.hoursText, { b: true, size: 22, color: C.p }), { after: 0 }), fill: C.light }],
    ], { widths: uw, header: true, zebra: 'F6F5FB' }));
    if (rep.totals.unparsed) body.push(p(r(`${rep.totals.unparsed} dag(en) zonder leesbare werkuren zijn niet meegeteld.`, { i: true, color: GRAY, size: 16 }), { before: 80 }));

    body.push(h2('Ondertekening', C.p));
    body.push(spacer(60));
    const half = Math.floor(PAGE_W / 2);
    const signCell = (role, name) => ({
      c: p(r(role.toUpperCase(), { b: true, color: GRAY, size: 15, spacing: 20 }), { after: 40 }) + p(r(name || ' ', { b: true }), { after: 500 })
        + p(r('Datum: ____________________', { color: GRAY, size: 18 }), { after: 400 })
        + p(r('Handtekening: ______________', { color: GRAY, size: 18 }), { after: 0 }),
      vAlign: 'top',
    });
    body.push(table([[signCell('Stagiair', rep.name), signCell('Stagebegeleider', rep.mentor)]], { widths: [half, PAGE_W - half], noBorders: true, pad: 100 }));

    const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="708"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>`;
    const documentXml = `${XML}<w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;

    const headerXml = `${XML}<w:hdr ${NS}>${p([r(`Stagelogboek${rep.name ? ' — ' + rep.name : ''}`, { b: true, color: C.p, size: 16 }), '<w:r><w:tab/></w:r>', r(rep.opleiding || '', { color: GRAY, size: 16 })], { tabRight: PAGE_W, border: { color: C.p, sz: 6, space: 4 }, after: 0 })}</w:hdr>`;
    const field = instr => `<w:fldSimple w:instr=" ${instr} "><w:r><w:rPr><w:b/><w:color w:val="${C.p}"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`;
    const footerXml = `${XML}<w:ftr ${NS}>${p([r(rep.periodText, { color: GRAY, size: 16 }), '<w:r><w:tab/></w:r>', r('Pagina ', { color: GRAY, size: 16 }), field('PAGE'), r(' van ', { color: GRAY, size: 16 }), field('NUMPAGES')], { tabRight: PAGE_W, after: 0 })}</w:ftr>`;

    const lvl = color => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="260"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:color w:val="${color}"/></w:rPr></w:lvl>`;
    const colorsByNum = [[1, C.p], ...secKeys.map(k => [numIds[k], SEC[k]])];
    const numberingXml = `${XML}<w:numbering ${NS}>${colorsByNum.map(([id, col]) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="singleLevel"/>${lvl(col)}</w:abstractNum>`).join('')}${colorsByNum.map(([id]) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`).join('')}</w:numbering>`;

    const stylesXml = `${XML}<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="nl-NL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="1F2333"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="${C.p}"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:caps/><w:spacing w:val="12"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

    const settingsXml = `${XML}<w:settings ${NS}><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const docRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
    const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x('Stagelogboek' + (rep.name ? ' — ' + rep.name : ''))}</dc:title><dc:creator>${x(rep.name || 'StageLog')}</dc:creator><dc:language>nl-NL</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified></cp:coreProperties>`;
    const app = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>StageLog Terminal</Application></Properties>`;

    return zip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rels },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/styles.xml', data: stylesXml },
      { name: 'word/numbering.xml', data: numberingXml },
      { name: 'word/settings.xml', data: settingsXml },
      { name: 'word/header1.xml', data: headerXml },
      { name: 'word/footer1.xml', data: footerXml },
      { name: 'word/_rels/document.xml.rels', data: docRels },
      { name: 'docProps/core.xml', data: core },
      { name: 'docProps/app.xml', data: app },
    ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  window.StageDocx = { build };
})();
