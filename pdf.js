/* MiniPDF: piccolo generatore di PDF (A4, Helvetica) che funziona senza internet.
   Coordinate in punti, con l'origine in alto a sinistra; per il testo "y" è la linea di base. */
(() => {
  'use strict';

  const W = 595.28, H = 841.89;

  // Larghezze dei caratteri Helvetica (unità /1000), ASCII 32–126
  const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

  // Caratteri fuori da Latin-1 che esistono in WinAnsiEncoding
  const WINANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '×': 0xd7 };

  function normChar(ch) {
    if (ch === ' ' || ch === ' ' || ch === ' ') return ' ';
    if (ch === '‑') return '-';
    return ch;
  }

  function charWidth(ch, bold) {
    ch = normChar(ch);
    const t = bold ? HELV_B : HELV;
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return t[c - 32];
    if (ch === ' ') return 278;
    if (ch === '€') return 556;
    if (ch === '×') return 584;
    if (ch === '–') return 556;
    if (ch === '—') return 1000;
    if (ch === '•') return 350;
    if (ch === '’' || ch === '‘') return bold ? 278 : 222;
    const base = ch.normalize('NFD')[0];
    const b = base.charCodeAt(0);
    if (b >= 32 && b <= 126) return t[b - 32];
    return 556;
  }

  // Converte il testo in byte WinAnsi (una stringa con un carattere per byte) e fa l'escape per il PDF
  function encode(str) {
    let out = '';
    for (let ch of String(str)) {
      ch = normChar(ch);
      let code;
      if (WINANSI[ch] !== undefined) code = WINANSI[ch];
      else {
        const c = ch.charCodeAt(0);
        code = c < 256 ? c : 63; // '?'
      }
      if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + String.fromCharCode(code);
      else if (code < 32) out += ' ';
      else out += String.fromCharCode(code);
    }
    return out;
  }

  const n = (v) => (Math.round(v * 100) / 100).toString();
  const rgb = (c) => c.map((v) => n(v / 255)).join(' ');
  const hex = (h) => { const x = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
  const col = (c) => (typeof c === 'string' ? hex(c) : c);

  class MiniPDF {
    constructor() {
      this.W = W; this.H = H;
      this.pages = [];
      this.addPage();
    }
    addPage() { this.ops = []; this.pages.push(this.ops); }

    textWidth(str, size = 10, bold = false) {
      let w = 0;
      for (const ch of String(str)) w += charWidth(ch, bold);
      return (w * size) / 1000;
    }

    text(x, y, str, { size = 10, bold = false, color = [0, 0, 0], align = 'left' } = {}) {
      const w = this.textWidth(str, size, bold);
      const tx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${rgb(col(color))} rg ${n(tx)} ${n(H - y)} Td (${encode(str)}) Tj ET`);
      return w;
    }

    // Spezza il testo in righe che stanno in maxWidth
    wrap(str, maxWidth, size = 10, bold = false) {
      const lines = [];
      for (const para of String(str).split(/\r?\n/)) {
        let line = '';
        for (const word of para.split(/\s+/)) {
          const tryLine = line ? line + ' ' + word : word;
          if (this.textWidth(tryLine, size, bold) <= maxWidth || !line) line = tryLine;
          else { lines.push(line); line = word; }
        }
        lines.push(line);
      }
      return lines;
    }

    rect(x, y, w, h, { fill = null, stroke = null, lineWidth = 0.6 } = {}) {
      let op = '';
      if (fill) op += `${rgb(col(fill))} rg `;
      if (stroke) op += `${rgb(col(stroke))} RG ${n(lineWidth)} w `;
      op += `${n(x)} ${n(H - y - h)} ${n(w)} ${n(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`;
      this.ops.push(op);
    }

    line(x1, y1, x2, y2, { color = [0, 0, 0], width = 0.6 } = {}) {
      this.ops.push(`${rgb(col(color))} RG ${n(width)} w ${n(x1)} ${n(H - y1)} m ${n(x2)} ${n(H - y2)} l S`);
    }

    // Restituisce il PDF come Uint8Array
    output(title = 'Documento') {
      const objs = [];
      const add = (s) => { objs.push(s); return objs.length; };
      const catalog = add(null);
      const pagesObj = add(null);
      const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const info = add(`<< /Title (${encode(title)}) /Producer (Agenda B&B) >>`);
      const kids = [];
      for (const ops of this.pages) {
        const stream = ops.join('\n');
        const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
      }
      objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
      objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

      let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
      const offsets = [];
      objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = pdf.length;
      pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
      offsets.forEach((o) => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
      pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;

      const bytes = new Uint8Array(pdf.length);
      for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
      return bytes;
    }
  }

  window.MiniPDF = MiniPDF;
})();
