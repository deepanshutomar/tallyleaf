import jsQR from 'jsqr';
import { apply, scaleAt, solveHomography, type H, type P } from './homography';
import { decodeSheet, type SheetId } from './qr';
import type { Field, Flag, Geometry, Mark, Rect, Version } from './schema';

export type RGBA = { width: number; height: number; data: Uint8ClampedArray };
export type Gray = { w: number; h: number; d: Uint8Array };

export type FieldResult = { value: number | string | null; flag?: Flag; scores: number[] };

export type PageScan =
  | { ok: true; sheet: SheetId; version: Version; fields: Record<string, FieldResult>; crops: Record<string, Gray>; alignErrorMm: number }
  | { ok: false; error: string; sheet?: SheetId };

export const THRESHOLDS = { mark: 0.25, faint: 0.12 };

const WORK_SIDE = 2000;

/** Darkness channel: min(R,G,B), so blue/red pens read as dark. Area-averaged downscale. */
export function toGray(img: RGBA, maxSide: number): Gray {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const d = new Uint8Array(w * h);
  const fx = img.width / w;
  const fy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
          sum += r < g ? (r < b ? r : b) : g < b ? g : b;
        }
      }
      d[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { w, h, d };
}

function grayToRgba(g: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = g.d[i];
    out[j + 3] = 255;
  }
  return out;
}

function resize(g: Gray, maxSide: number): Gray {
  return toGray({ width: g.w, height: g.h, data: grayToRgba(g) }, maxSide);
}

type QrHit = { text: string; corners: P[] };

function findQr(work: Gray, original: RGBA): QrHit | null {
  const tries: Gray[] = [work];
  if (Math.max(work.w, work.h) > 1300) tries.push(resize(work, 1300));
  if (Math.max(original.width, original.height) > WORK_SIDE * 1.2) tries.push(toGray(original, 3200));
  for (const g of tries) {
    const res = jsQR(grayToRgba(g), g.w, g.h, { inversionAttempts: 'attemptBoth' });
    if (!res) continue;
    const k = work.w / g.w;
    const l = res.location;
    const c = [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner];
    return { text: res.data, corners: c.map((p) => [p.x * k, p.y * k] as P) };
  }
  return null;
}

function sample(g: Gray, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= g.w - 1 || y >= g.h - 1) return 255;
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i = y0 * g.w + x0;
  const a = g.d[i], b = g.d[i + 1], c = g.d[i + g.w], d = g.d[i + g.w + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

type Blob = { cx: number; cy: number; area: number };

/** Solid, roughly square/round dark blobs (candidate corner markers). */
function findBlobs(g: Gray, minArea: number, maxArea: number, win: number): Blob[] {
  const { w, h, d } = g;
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[y * w + x];
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(win / 2));
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const sum = integ[yb * (w + 1) + xb] - integ[ya * (w + 1) + xb] - integ[yb * (w + 1) + xa] + integ[ya * (w + 1) + xa];
      const mean = sum / ((yb - ya) * (xb - xa));
      dark[y * w + x] = d[y * w + x] < mean * 0.62 && d[y * w + x] < 150 ? 1 : 0;
    }
  }
  const blobs: Blob[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (dark[start] !== 1) continue;
    let sp = 0;
    stack[sp++] = start;
    dark[start] = 2;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x > 0 && dark[p - 1] === 1) { dark[p - 1] = 2; stack[sp++] = p - 1; }
      if (x < w - 1 && dark[p + 1] === 1) { dark[p + 1] = 2; stack[sp++] = p + 1; }
      if (y > 0 && dark[p - w] === 1) { dark[p - w] = 2; stack[sp++] = p - w; }
      if (y < h - 1 && dark[p + w] === 1) { dark[p + w] = 2; stack[sp++] = p + w; }
    }
    if (n < minArea || n > maxArea) continue;
    const mx = sx / n, my = sy / n;
    const a = sxx / n - mx * mx, c = syy / n - my * my, b = sxy / n - mx * my;
    const tr = a + c, det = a * c - b * b;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l2 <= 0) continue;
    const solidity = n / (12 * Math.sqrt(l1 * l2));
    if (l1 / l2 > 3 || solidity < 0.8 || solidity > 1.2) continue;
    blobs.push({ cx: mx + 0.5, cy: my + 0.5, area: n });
  }
  return blobs;
}

function affineFrom(src: P[], dst: P[]): H {
  // Least-squares affine (6 params) as a homography with no perspective terms.
  const solve = (k: 0 | 1) => {
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const v = [0, 0, 0];
    src.forEach(([x, y], i) => {
      const row = [x, y, 1];
      for (let a = 0; a < 3; a++) {
        v[a] += row[a] * dst[i][k];
        for (let b = 0; b < 3; b++) m[a][b] += row[a] * row[b];
      }
    });
    const det = (q: number[][]) =>
      q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
    const D = det(m);
    return [0, 1, 2].map((col) => det(m.map((r, i) => r.map((x, j) => (j === col ? v[i] : x)))) / D);
  };
  const [a, b, c] = solve(0);
  const [d, e, f] = solve(1);
  return [a, b, c, d, e, f, 0, 0, 1];
}

function locatePage(work: Gray, geo: Geometry, qrCorners: P[]): { h: H; black: number; alignErrorMm: number } | string {
  const q = geo.qr;
  const qrPage: P[] = [[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.h], [q.x, q.y + q.h]];
  const approx = affineFrom(qrPage, qrCorners);
  const ppm = scaleAt(approx, q.x, q.y);
  if (ppm < 2.5) return 'The photo resolution is too low. Move closer or use a higher resolution.';
  const A = (geo.markerSize * ppm) ** 2;
  const blobs = findBlobs(work, A * 0.3, A * 3, geo.markerSize * ppm * 5);
  const used = new Set<Blob>();
  const names = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const found: P[] = [];
  for (let i = 0; i < 4; i++) {
    const [px, py] = apply(approx, ...geo.markers[i]);
    let best: Blob | null = null;
    let bestD = 60 * ppm;
    for (const b of blobs) {
      if (used.has(b)) continue;
      const dd = Math.hypot(b.cx - px, b.cy - py);
      if (dd < bestD) { bestD = dd; best = b; }
    }
    if (!best) return `Could not find the ${names[i]} corner square. Make sure all four black squares are in the photo.`;
    used.add(best);
    found.push([best.cx, best.cy]);
  }
  const h = solveHomography(geo.markers, found);
  const qc = apply(h, q.x + q.w / 2, q.y + q.h / 2);
  const mid = qrCorners.reduce<P>((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const alignErrorMm = Math.hypot(qc[0] - mid[0], qc[1] - mid[1]) / scaleAt(h, q.x, q.y);
  if (alignErrorMm > 4) return 'The page could not be aligned reliably (corner squares and code disagree). Retake the photo flat and straight.';
  let black = 0;
  for (const [mx, my] of geo.markers) {
    let s = 0;
    for (let k = 0; k < 9; k++) {
      const [x, y] = apply(h, mx + ((k % 3) - 1) * 1.5, my + (((k / 3) | 0) - 1) * 1.5);
      s += sample(work, x, y);
    }
    black += s / 9 / 4;
  }
  return { h, black, alignErrorMm };
}

const RING = Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * 2 * Math.PI), Math.sin((i / 24) * 2 * Math.PI)]);

function ringMean(g: Gray, h: H, m: Mark, r: number, dx: number, dy: number): number {
  let s = 0;
  for (const [c, sn] of RING) {
    let ox = c * r, oy = sn * r;
    if (m.shape === 'square') {
      const k = r / Math.max(Math.abs(c), Math.abs(sn));
      ox = c * k; oy = sn * k;
    }
    const [x, y] = apply(h, m.x + dx + ox, m.y + dy + oy);
    s += sample(g, x, y);
  }
  return s / RING.length;
}

/** Shift (mm) that best lines the printed outlines up with the image, to absorb lens distortion and paper curl. */
function refineOffset(g: Gray, h: H, marks: Mark[], R: number): [number, number] {
  const score = (dx: number, dy: number) => {
    let s = 0;
    for (const m of marks) {
      const edge = (ringMean(g, h, m, R - 0.12, dx, dy) + ringMean(g, h, m, R + 0.12, dx, dy)) / 2;
      s += ringMean(g, h, m, R * 1.6, dx, dy) - edge;
    }
    return s;
  };
  let best: [number, number] = [0, 0];
  let bestS = score(0, 0);
  for (const step of [0.4, 0.12]) {
    const [bx, by] = best;
    for (let i = -3; i <= 3; i++)
      for (let j = -3; j <= 3; j++) {
        if (!i && !j) continue;
        const s = score(bx + i * step, by + j * step);
        if (s > bestS) { bestS = s; best = [bx + i * step, by + j * step]; }
      }
  }
  return best;
}

function markDarkness(g: Gray, h: H, m: Mark, R: number, dx: number, dy: number, black: number): number {
  const vals: number[] = [];
  const ri = R * 0.55;
  for (let ix = -4; ix <= 4; ix++)
    for (let iy = -4; iy <= 4; iy++) {
      const ox = (ix / 4) * ri, oy = (iy / 4) * ri;
      if (m.shape === 'circle' && ox * ox + oy * oy > ri * ri) continue;
      const [x, y] = apply(h, m.x + dx + ox, m.y + dy + oy);
      vals.push(sample(g, x, y));
    }
  const inner = vals.reduce((a, b) => a + b, 0) / vals.length;
  const outer: number[] = [];
  for (const r of [R * 1.45, R * 1.75]) for (const [c, sn] of RING) {
    const [x, y] = apply(h, m.x + dx + c * r, m.y + dy + sn * r);
    outer.push(sample(g, x, y));
  }
  outer.sort((a, b) => a - b);
  const white = outer[Math.floor(outer.length * 0.85)];
  if (white - black < 25) return 0;
  return Math.min(1, Math.max(0, (white - inner) / (white - black)));
}

function decideChoice(scores: number[]): { idx: number; flag?: Flag } {
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
  const [m1, i1] = order[0];
  const m2 = order[1]?.[0] ?? 0;
  const { mark, faint } = THRESHOLDS;
  if (m1 < faint) return { idx: -1, flag: 'blank' };
  if (m1 < mark) return { idx: i1, flag: 'faint' };
  if (m2 >= mark && m2 > m1 * 0.5) return { idx: i1, flag: 'multiple' };
  if (m2 >= faint && m2 > m1 * 0.6) return { idx: i1, flag: 'unclear' };
  return { idx: i1 };
}

/** Warp a page region (mm) into an upright grayscale image at `ppmOut` px per mm. */
export function cropRegion(g: Gray, h: H, r: Rect, ppmOut = 6, pad = 1.5): Gray {
  const w = Math.round((r.w + 2 * pad) * ppmOut);
  const hh = Math.round((r.h + 2 * pad) * ppmOut);
  const d = new Uint8Array(w * hh);
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < w; x++) {
      const [sx, sy] = apply(h, r.x - pad + x / ppmOut, r.y - pad + y / ppmOut);
      d[y * w + x] = sample(g, sx, sy);
    }
  return { w, h: hh, d };
}

function inkFraction(g: Gray, h: H, r: Rect, black: number): number {
  let dark = 0, n = 0;
  for (let y = r.y + 1.5; y < r.y + r.h - 1.5; y += 0.5)
    for (let x = r.x + 1.5; x < r.x + r.w - 1.5; x += 0.5) {
      const [sx, sy] = apply(h, x, y);
      n++;
      if (sample(g, sx, sy) < black + 70) dark++;
    }
  return n ? dark / n : 0;
}

export type Lookup = (sheet: SheetId) => Version | string;

export function scanPage(img: RGBA, lookup: Lookup): PageScan {
  const work = toGray(img, WORK_SIDE);
  const qr = findQr(work, img);
  if (!qr) return { ok: false, error: 'No Tallyleaf code found on this image. Make sure the whole page is visible, in focus and well lit.' };
  const sheet = decodeSheet(qr.text);
  if (!sheet) return { ok: false, error: 'The code on this page is not a Tallyleaf code.' };
  const version = lookup(sheet);
  if (typeof version === 'string') return { ok: false, error: version, sheet };
  const loc = locatePage(work, version.geometry, qr.corners);
  if (typeof loc === 'string') return { ok: false, error: loc, sheet };
  const { h, black } = loc;
  const R = version.geometry.markR;

  const fields: Record<string, FieldResult> = {};
  const crops: Record<string, Gray> = {};
  const offsets = new Map<string, [number, number]>();
  const pageFields = version.fields.filter((f) => f.page === sheet.page);

  for (const f of pageFields) {
    if (f.type === 'text') {
      const blank = inkFraction(work, h, f.region, black) < 0.004;
      fields[f.var] = { value: null, flag: blank ? undefined : 'text', scores: [] };
      if (!blank) crops[f.var] = cropRegion(work, h, f.region);
      continue;
    }
    const key = f.type === 'check' ? `${f.group}` : f.var;
    if (!offsets.has(key)) {
      const groupMarks = f.type === 'check' ? pageFields.filter((x) => x.group === f.group).flatMap((x) => x.marks) : f.marks;
      offsets.set(key, refineOffset(work, h, groupMarks, R));
    }
    const [dx, dy] = offsets.get(key)!;
    const scores = f.marks.map((m) => markDarkness(work, h, m, R, dx, dy, black));
    let res: FieldResult;
    if (f.type === 'check') {
      const s = scores[0];
      const { mark, faint } = THRESHOLDS;
      res = { value: s >= (mark + faint) / 2 ? 1 : 0, scores, flag: s >= faint && s < mark ? 'faint' : undefined };
    } else if (f.type === 'choice') {
      const d = decideChoice(scores);
      res = { value: d.idx < 0 ? null : f.marks[d.idx].value, flag: d.flag, scores };
    } else {
      const n = f.digits ?? 1;
      let digits = '';
      let flag: Flag | undefined;
      let seenDigit = false;
      let blankAfter = false;
      for (let p = 0; p < n; p++) {
        const idx = f.marks.map((m, i) => (m.pos === p ? i : -1)).filter((i) => i >= 0);
        const d = decideChoice(idx.map((i) => scores[i]));
        if (d.idx < 0) {
          if (seenDigit) blankAfter = true;
          continue;
        }
        seenDigit = true;
        if (d.flag && !flag) flag = d.flag;
        digits += String(f.marks[idx[d.idx]].value);
      }
      if (blankAfter) flag = 'unclear';
      res = { value: digits ? Number(digits) : null, flag: digits ? flag : 'blank', scores };
    }
    fields[f.var] = res;
    if (res.flag) crops[f.var] = cropRegion(work, h, f.region);
  }
  return { ok: true, sheet, version, fields, crops, alignErrorMm: loc.alignErrorMm };
}

export const fieldsOnPage = (v: Version, page: number): Field[] => v.fields.filter((f) => f.page === page);
