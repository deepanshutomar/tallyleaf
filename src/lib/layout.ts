import type { Block, Field, FormDef, Geometry, Mark, Rect, ScaleOption } from './schema';

export type DrawOp =
  | { t: 'text'; x: number; y: number; size: number; text: string; bold?: boolean; align?: 'left' | 'center' | 'right'; gray?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: number; stroke?: number; lw?: number }
  | { t: 'circle'; x: number; y: number; r: number; fill?: number; stroke?: number; lw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: number; lw: number };

export type Fonts = {
  /** Width in mm of `text` at `size` pt. */
  measure: (text: string, size: number, bold?: boolean) => number;
  /** Replace characters the PDF font cannot print. */
  clean: (text: string) => string;
};

export type Layout = { geometry: Geometry; pages: DrawOp[][]; fields: Field[] };

const PT = 0.3528;
const lh = (size: number) => size * PT * 1.3;
const asc = (size: number) => size * PT * 0.74;

export const GEOMETRY: Geometry = {
  pageW: 210,
  pageH: 297,
  markerSize: 7,
  markers: [[10.5, 10.5], [199.5, 10.5], [10.5, 286.5], [199.5, 286.5]],
  qr: { x: 168, y: 7, w: 20, h: 20 },
  markR: 2.1,
};

const X0 = 17;
const X1 = 193;
const CW = X1 - X0;
const Y_TOP = 35;
const Y_MAX = 275;
const R = GEOMETRY.markR;
const INK = 0.12;
const LINE = 0.35;

export function wrap(fonts: Fonts, text: string, size: number, width: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of fonts.clean(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let w of words) {
      while (fonts.measure(w, size, bold) > width && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && fonts.measure(w.slice(0, k), size, bold) > width) k--;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      const next = line ? `${line} ${w}` : w;
      if (fonts.measure(next, size, bold) <= width) line = next;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

export function computeLayout(form: FormDef, fonts: Fonts): Layout {
  const pages: DrawOp[][] = [];
  const fields: Field[] = [];
  let ops: DrawOp[] = [];
  let y = Y_TOP;
  let q = 0;

  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = Y_TOP;
  };
  const page = () => pages.length;
  const ensure = (h: number) => {
    if (y + h > Y_MAX && y > Y_TOP) newPage();
  };
  const textLines = (lines: string[], x: number, top: number, size: number, bold = false, gray = INK) => {
    lines.forEach((l, i) => ops.push({ t: 'text', x, y: top + i * lh(size) + asc(size), size, text: l, bold, gray }));
    return lines.length * lh(size);
  };

  newPage();

  for (const b of form.blocks) {
    switch (b.kind) {
      case 'pagebreak':
        if (y > Y_TOP) newPage();
        continue;
      case 'heading': {
        const lines = wrap(fonts, b.text, 12, CW, true);
        ensure(lines.length * lh(12) + 12);
        y += textLines(lines, X0, y, 12, true) + 1;
        ops.push({ t: 'line', x1: X0, y1: y, x2: X1, y2: y, stroke: 0.6, lw: 0.3 });
        y += 3;
        break;
      }
      case 'text': {
        const lines = wrap(fonts, b.text, 9, CW);
        for (const l of lines) {
          ensure(lh(9));
          y += textLines([l], X0, y, 9, false, 0.2);
        }
        y += 1;
        break;
      }
      case 'likert':
        likert(b);
        break;
      case 'single':
      case 'multi':
        choice(b);
        break;
      case 'number':
        digits(b);
        break;
      case 'open':
        open(b);
        break;
    }
    y += 5;
  }

  if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();

  return { geometry: GEOMETRY, pages, fields };

  function likert(b: Extract<Block, { kind: 'likert' }>) {
    const n = b.options.length;
    const colW = Math.min(20, Math.max(11, (CW * 0.52) / n));
    const textX = X0 + 7;
    const textW = CW - colW * n - 9;
    const optX = X1 - colW * n;
    const headLines = b.options.map((o) => wrap(fonts, o.label, 7, colW - 1.5));
    const headH = Math.max(...headLines.map((l) => l.length)) * lh(7) + lh(6.5) + 2;
    const titleLines = b.title.trim() ? wrap(fonts, b.title, 9.5, CW, true) : [];
    const values = b.options.map((o) => o.value);

    const header = (cont: boolean) => {
      const top = y;
      ops.push({ t: 'rect', x: X0, y: top, w: CW, h: headH, fill: 0.9 });
      if (cont) ops.push({ t: 'text', x: X0 + 2, y: top + headH - 2, size: 7, text: '(continued)', gray: 0.35 });
      b.options.forEach((o, j) => {
        const cx = optX + colW * (j + 0.5);
        const lines = headLines[j];
        const maxL = Math.max(...headLines.map((l) => l.length));
        const off = (maxL - lines.length) * lh(7);
        lines.forEach((l, i) =>
          ops.push({ t: 'text', x: cx, y: top + 1 + off + i * lh(7) + asc(7), size: 7, text: l, align: 'center', gray: INK }),
        );
        ops.push({ t: 'text', x: cx, y: top + 1 + maxL * lh(7) + asc(6.5), size: 6.5, text: `(${o.value})`, align: 'center', gray: 0.4 });
      });
      y += headH;
    };

    const rows = b.items.map((it) => {
      const lines = wrap(fonts, it.text, 9, textW);
      return { it, lines, h: Math.max(lines.length * lh(9) + 2.8, 7.5) };
    });

    ensure(titleLines.length * lh(9.5) + 2 + headH + (rows[0]?.h ?? 0));
    if (titleLines.length) y += textLines(titleLines, X0, y, 9.5, true) + 2;
    header(false);

    rows.forEach(({ it, lines, h }, i) => {
      if (y + h > Y_MAX) {
        newPage();
        header(true);
      }
      if (i % 2 === 0) ops.push({ t: 'rect', x: X0, y, w: CW, h, fill: 0.955 });
      const ty = y + (h - lines.length * lh(9)) / 2;
      ops.push({ t: 'text', x: X0 + 1.5, y: ty + asc(9), size: 9, text: `${i + 1}.`, gray: 0.35 });
      textLines(lines, textX, ty, 9);
      const cy = y + h / 2;
      const marks: Mark[] = b.options.map((o, j) => {
        const cx = optX + colW * (j + 0.5);
        ops.push({ t: 'circle', x: cx, y: cy, r: R, fill: 1, stroke: INK, lw: LINE });
        return { x: cx, y: cy, value: o.value, shape: 'circle' };
      });
      fields.push({
        var: it.varName, type: 'choice', label: it.text, page: page(), marks,
        region: { x: X0, y, w: CW, h }, valueLabels: b.options.map((o) => ({ ...o })),
        reverse: !!it.reverse, subscale: it.subscale?.trim() || undefined,
        min: Math.min(...values), max: Math.max(...values), group: b.id,
      });
      y += h;
    });
  }

  function choice(b: Extract<Block, { kind: 'single' | 'multi' }>) {
    q++;
    const multi = b.kind === 'multi';
    const qLines = wrap(fonts, `${q}. ${b.text}`, 9.5, CW, true);
    const labels: string[] = multi ? b.options : b.options.map((o) => o.label);
    const items = labels.map((l) => {
      const text = wrap(fonts, l, 9, CW - 12)[0] ?? '';
      return { text, w: 2 * R + 2 + fonts.measure(text, 9) + 6 };
    });
    const rowsX: number[][] = [];
    let cur: number[] = [];
    let x = X0 + 4;
    items.forEach((it, i) => {
      if (cur.length && x + it.w > X1) { rowsX.push(cur); cur = []; x = X0 + 4; }
      cur.push(i);
      x += it.w;
    });
    rowsX.push(cur);
    const rowH = 7;
    const h = qLines.length * lh(9.5) + 1.5 + rowsX.length * rowH;
    ensure(h);
    const top = y;
    y += textLines(qLines, X0, y, 9.5, true) + 1.5;
    const marks: Mark[] = [];
    for (const row of rowsX) {
      let x = X0 + 4;
      const cy = y + rowH / 2;
      for (const i of row) {
        const cx = x + R;
        if (multi) ops.push({ t: 'rect', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: 1, stroke: INK, lw: LINE });
        else ops.push({ t: 'circle', x: cx, y: cy, r: R, fill: 1, stroke: INK, lw: LINE });
        ops.push({ t: 'text', x: cx + R + 2, y: cy + asc(9) / 2 - 0.2, size: 9, text: items[i].text, gray: INK });
        marks.push({ x: cx, y: cy, value: multi ? 1 : (b.options[i] as ScaleOption).value, shape: multi ? 'square' : 'circle' });
        x += items[i].w;
      }
      y += rowH;
    }
    const region: Rect = { x: X0, y: top, w: CW, h: y - top };
    if (multi) {
      marks.forEach((m, i) =>
        fields.push({
          var: `${b.varName}_${i + 1}`, type: 'check', label: `${b.text} — ${b.options[i]}`, page: page(),
          marks: [m], region, valueLabels: [{ label: 'Not ticked', value: 0 }, { label: 'Ticked', value: 1 }], group: b.id,
        }),
      );
    } else {
      const values = b.options.map((o) => o.value);
      fields.push({
        var: b.varName, type: 'choice', label: b.text, page: page(), marks, region,
        valueLabels: b.options.map((o) => ({ ...o })), min: Math.min(...values), max: Math.max(...values), group: b.id,
      });
    }
  }

  function digits(b: Extract<Block, { kind: 'number' }>) {
    q++;
    const n = Math.max(1, Math.min(8, Math.round(b.digits)));
    const qLines = wrap(fonts, `${q}. ${b.text}`, 9.5, CW, true);
    const hint = 'Write the number in the boxes (use leading zeros, e.g. 07), then fill one bubble per row.';
    const rowH = 6.5;
    const h = qLines.length * lh(9.5) + lh(7.5) + 1 + lh(7) + n * rowH;
    ensure(h);
    const top = y;
    y += textLines(qLines, X0, y, 9.5, true);
    y += textLines([fonts.clean(hint)], X0, y, 7.5, false, 0.35) + 1;
    const bx = X0 + 18;
    const step = 6.5;
    for (let d = 0; d < 10; d++)
      ops.push({ t: 'text', x: bx + d * step, y: y + asc(7), size: 7, text: String(d), align: 'center', gray: 0.35 });
    y += lh(7);
    const marks: Mark[] = [];
    for (let p = 0; p < n; p++) {
      const cy = y + rowH / 2;
      ops.push({ t: 'rect', x: X0 + 4, y: cy - 2.9, w: 7, h: 5.8, fill: 1, stroke: 0.4, lw: 0.3 });
      for (let d = 0; d < 10; d++) {
        const cx = bx + d * step;
        ops.push({ t: 'circle', x: cx, y: cy, r: R, fill: 1, stroke: INK, lw: LINE });
        marks.push({ x: cx, y: cy, value: d, shape: 'circle', pos: p });
      }
      y += rowH;
    }
    fields.push({
      var: b.varName, type: 'digits', label: b.text, page: page(), marks, digits: n,
      region: { x: X0, y: top, w: Math.min(CW, bx + 9 * step + 6 - X0), h: y - top }, group: b.id,
    });
  }

  function open(b: Extract<Block, { kind: 'open' }>) {
    q++;
    const lines = Math.max(1, Math.min(20, Math.round(b.lines)));
    const qLines = wrap(fonts, `${q}. ${b.text}`, 9.5, CW, true);
    const boxH = lines * 8 + 2;
    ensure(qLines.length * lh(9.5) + 1.5 + boxH);
    y += textLines(qLines, X0, y, 9.5, true) + 1.5;
    const region = { x: X0, y, w: CW, h: boxH };
    ops.push({ t: 'rect', ...region, stroke: 0.55, lw: 0.3 });
    for (let i = 1; i <= lines; i++) {
      const ly = y + 1 + i * 8 - 1.5;
      ops.push({ t: 'line', x1: X0 + 3, y1: ly, x2: X1 - 3, y2: ly, stroke: 0.82, lw: 0.2 });
    }
    fields.push({ var: b.varName, type: 'text', label: b.text, page: page(), marks: [], region, group: b.id });
    y += boxH;
  }
}
