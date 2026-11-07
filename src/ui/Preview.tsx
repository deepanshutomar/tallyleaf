import { useEffect, useRef, useState } from 'react';
import { loadPdfjs } from '../lib/browser';
import { previewPdf, unsupportedChars } from '../lib/pdf';
import type { FormDef } from '../lib/schema';

export function Preview({ form }: { form: FormDef }) {
  const box = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [bad, setBad] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const [{ bytes, pages }, chars, pdfjs] = await Promise.all([previewPdf(form), unsupportedChars(form), loadPdfjs()]);
        const task = pdfjs.getDocument({ data: bytes });
        const doc = await task.promise;
        const canvases: HTMLCanvasElement[] = [];
        const width = (box.current?.clientWidth || 440) * Math.min(2, window.devicePixelRatio || 1);
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width);
          c.height = Math.round(vp.height);
          c.setAttribute('aria-label', `Preview page ${i}`);
          await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise;
          canvases.push(c);
        }
        await task.destroy();
        if (cancelled || !box.current) return;
        box.current.replaceChildren(...canvases);
        setPages(pages);
        setBad(chars);
        setError('');
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form]);

  return (
    <div>
      <div className="preview-head">
        <h3 style={{ margin: 0 }}>On paper</h3>
        <span className="live">live</span>
        <span className="grow" />
        <span className="mono muted" style={{ fontSize: '.8rem' }}>{pages ? `${pages} page${pages === 1 ? '' : 's'} per copy · A4` : ''}</span>
      </div>
      {bad.length > 0 && (
        <div className="note warn" style={{ marginBottom: '.8rem' }}>The PDF font can't print {bad.join(' ')} yet, so they'll show as “?”. Hindi and other scripts are on the list.</div>
      )}
      {error && <div className="note bad" style={{ marginBottom: '.8rem' }}>The preview failed: {error}</div>}
      {!pages && !error && <div className="skeleton" aria-label="Preparing preview">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>}
      <div className="preview" ref={box} />
    </div>
  );
}
