import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join } from 'node:path';
import type { Gray, RGBA } from '../src/lib/scan';

const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const MAX_SIDE = 3200;

export type InputPage = { label: string; file: string; rgba?: RGBA; error?: string };

/** Every image and PDF under the given files/folders, sorted, recursively. */
export function collectInputs(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p).sort()) if (!name.startsWith('.')) walk(join(p, name));
    } else {
      const ext = extname(p).toLowerCase();
      if (IMAGE.has(ext) || ext === '.pdf' || ext === '.heic' || ext === '.heif') out.push(p);
    }
  };
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`Not found: ${p}`);
    walk(p);
  }
  return out;
}

function canvasRgba(img: { width: number; height: number }, draw: (ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, w: number, h: number) => void): RGBA {
  const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  draw(ctx, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8ClampedArray(id.data) };
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const req = createRequire(import.meta.url);
  const root = dirname(req.resolve('pdfjs-dist/package.json'));
  return { pdfjs, standardFontDataUrl: `${join(root, 'standard_fonts')}/` };
}

/** Turn a photo or a scanner PDF into page images (one per page). */
export async function* pagesFrom(file: string): AsyncGenerator<InputPage> {
  const ext = extname(file).toLowerCase();
  const name = basename(file);
  if (ext === '.heic' || ext === '.heif') {
    yield { label: name, file, error: `${name} is an iPhone HEIC photo. Convert it to JPG first (on the iPhone: Settings → Camera → Formats → Most Compatible; on a Mac: open in Preview → File → Export → JPEG).` };
    return;
  }
  if (ext === '.pdf') {
    const { pdfjs, standardFontDataUrl } = await loadPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), standardFontDataUrl, verbosity: 0 });
    const doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 200 / 72 });
      const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp, canvas: c as unknown as HTMLCanvasElement }).promise;
      const rgba = canvasRgba(c, (cx, w, h) => cx.drawImage(c, 0, 0, w, h));
      yield { label: `${name} · page ${i}`, file, rgba };
    }
    await task.destroy();
    return;
  }
  try {
    const img = await loadImage(readFileSync(file));
    yield { label: name, file, rgba: canvasRgba(img, (cx, w, h) => cx.drawImage(img, 0, 0, w, h)) };
  } catch {
    yield { label: name, file, error: `${name} couldn't be opened as an image. Use JPG, PNG or a PDF from a scanner.` };
  }
}

function grayCanvas(g: Gray) {
  const c = createCanvas(g.w, g.h);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(g.w, g.h);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) {
    id.data[j] = id.data[j + 1] = id.data[j + 2] = g.d[i];
    id.data[j + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/** Same format the website stores crops in, so project files are interchangeable. */
export function grayToDataUrl(g: Gray): string {
  return `data:image/jpeg;base64,${grayCanvas(g).toBuffer('image/jpeg', 72).toString('base64')}`;
}

export function dataUrlToBuffer(url: string): Buffer {
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}
