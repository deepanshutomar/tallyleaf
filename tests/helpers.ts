import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { apply, solveHomography, type P } from '../src/lib/homography';
import type { RGBA } from '../src/lib/scan';
import type { Field, Version } from '../src/lib/schema';

export async function renderPdf(bytes: Uint8Array, pxPerMm: number): Promise<RGBA[]> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise;
  const out: RGBA[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: (pxPerMm * 25.4) / 72 });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    out.push({ width: id.width, height: id.height, data: new Uint8ClampedArray(id.data) });
  }
  return out;
}

export type Style = 'fill' | 'tick' | 'cross' | 'faint' | 'thin';

/** Draw pen marks on a rendered page. `answers` maps var -> value (choice/digits) or 1/0 (check). */
export function fillPage(img: RGBA, pxPerMm: number, v: Version, page: number, answers: Record<string, number | null>, style: (f: Field) => Style, rng: () => number): RGBA {
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(img.data);
  ctx.putImageData(id, 0, 0);
  const k = pxPerMm;
  for (const f of v.fields.filter((x) => x.page === page)) {
    const a = answers[f.var];
    if (a === null || a === undefined) continue;
    let marks = f.marks;
    if (f.type === 'choice') marks = f.marks.filter((m) => m.value === a);
    else if (f.type === 'check') marks = a ? f.marks : [];
    else if (f.type === 'digits') {
      const s = String(a).padStart(f.digits!, '0');
      marks = f.marks.filter((m) => m.value === Number(s[m.pos!]));
    } else {
      // 1 = long ballpoint line, 2 = short word ("No"), 3 = pencil line
      ctx.strokeStyle = a === 3 ? 'rgb(120,120,125)' : 'rgb(20,30,120)';
      ctx.lineWidth = (a === 3 ? 0.3 : 0.4) * k;
      ctx.beginPath();
      for (let i = 0; i < (a === 2 ? 3 : 40); i++) {
        const x = (f.region.x + 5 + i * 2.2) * k;
        const y = (f.region.y + 6) * k;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 1 * k, y - 3 * k * rng(), x + 1.8 * k, y);
      }
      ctx.stroke();
      continue;
    }
    for (const m of marks) drawMark(ctx, m.x * k + (rng() - 0.5) * 0.6 * k, m.y * k + (rng() - 0.5) * 0.6 * k, k, style(f));
  }
  const out = ctx.getImageData(0, 0, img.width, img.height);
  return { width: out.width, height: out.height, data: new Uint8ClampedArray(out.data) };
}

function drawMark(ctx: SKRSContext2D, x: number, y: number, k: number, s: Style) {
  ctx.strokeStyle = ctx.fillStyle = s === 'faint' ? 'rgb(208,208,215)' : 'rgb(25,35,140)';
  ctx.lineWidth = 0.5 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (s === 'fill' || s === 'faint') {
    ctx.arc(x, y, 1.9 * k, 0, Math.PI * 2);
    ctx.fill();
  } else if (s === 'tick' || s === 'thin') {
    if (s === 'thin') ctx.lineWidth = 0.3 * k;
    ctx.moveTo(x - 1.6 * k, y);
    ctx.lineTo(x - 0.3 * k, y + 1.5 * k);
    ctx.lineTo(x + 2 * k, y - 2 * k);
    ctx.stroke();
  } else {
    ctx.moveTo(x - 1.7 * k, y - 1.7 * k);
    ctx.lineTo(x + 1.7 * k, y + 1.7 * k);
    ctx.moveTo(x + 1.7 * k, y - 1.7 * k);
    ctx.lineTo(x - 1.7 * k, y + 1.7 * k);
    ctx.stroke();
  }
}

/** Simulate a phone photo: page corners moved to `corners` (px) on a grey background, with uneven light and noise. */
export function photograph(img: RGBA, outW: number, outH: number, corners: P[], rng: () => number, light = 0.25): RGBA {
  const src: P[] = [[0, 0], [img.width, 0], [img.width, img.height], [0, img.height]];
  const inv = solveHomography(corners, src);
  const data = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++)
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = apply(inv, x + 0.5, y + 0.5);
      const j = (y * outW + x) * 4;
      const shade = 1 - light * (x / outW) * 0.6 - light * (y / outH) * 0.4;
      for (let c = 0; c < 3; c++) {
        let v = 95;
        if (sx >= 0 && sy >= 0 && sx < img.width - 1 && sy < img.height - 1) {
          const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = (y0 * img.width + x0) * 4 + c;
          v = (img.data[i] * (1 - fx) + img.data[i + 4] * fx) * (1 - fy) + (img.data[i + img.width * 4] * (1 - fx) + img.data[i + img.width * 4 + 4] * fx) * fy;
        }
        data[j + c] = v * shade + (rng() - 0.5) * 18;
      }
      data[j + 3] = 255;
    }
  return { width: outW, height: outH, data };
}

export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
