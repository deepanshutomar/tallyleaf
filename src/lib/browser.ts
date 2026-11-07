import type { Gray, RGBA } from './scan';

export function download(data: BlobPart | Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'questionnaire';

export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

function canvasToRgba(c: HTMLCanvasElement): RGBA {
  const id = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { width: id.width, height: id.height, data: id.data };
}

export type InputPage = { label: string; rgba: RGBA };

/** Turn an uploaded image or scanned PDF into page images. */
export async function* filePages(file: File): AsyncGenerator<InputPage> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 200 / 72 });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
      yield { label: `${file.name} · page ${i}`, rgba: canvasToRgba(c) };
    }
    await task.destroy();
    return;
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 3200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  yield { label: file.name, rgba: canvasToRgba(c) };
}

export function grayToDataUrl(g: Gray): string {
  const c = document.createElement('canvas');
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext('2d')!;
  const id = ctx.createImageData(g.w, g.h);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) {
    id.data[j] = id.data[j + 1] = id.data[j + 2] = g.d[i];
    id.data[j + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/jpeg', 0.72);
}
