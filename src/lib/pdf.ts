import {
  PDFArray, PDFDict, PDFDocument, PDFFont, PDFHexString, PDFName, PDFRawStream, PDFString,
  StandardFonts, decodePDFRawStream, grayscale, type PDFPage,
} from 'pdf-lib';
import QRCode from 'qrcode';
import { computeLayout, type DrawOp, type Fonts, type Layout } from './layout';
import { encodeSheet, formatSerial } from './qr';
import type { FormDef, Project, Version } from './schema';

const K = 72 / 25.4;
const PAGE_W = 210 * K;
const PAGE_H = 297 * K;
export const ATTACHMENT_NAME = 'project.psyform';

type FontPair = { regular: PDFFont; bold: PDFFont };

function fontsFrom(f: FontPair): Fonts {
  const supported = new Set(f.regular.getCharacterSet());
  const clean = (text: string) =>
    Array.from(text.replace(/\t/g, ' ').replace(/[‐-‒]/g, '-'), (c) =>
      c === '\n' || supported.has(c.codePointAt(0)!) ? c : '?').join('');
  return {
    clean,
    measure: (text, size, bold) => (bold ? f.bold : f.regular).widthOfTextAtSize(text, size) / K,
  };
}

async function embedFonts(doc: PDFDocument): Promise<FontPair> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

let cachedFonts: Fonts | null = null;
/** Font metrics for layout, without generating a PDF. */
export async function layoutFonts(): Promise<Fonts> {
  if (!cachedFonts) cachedFonts = fontsFrom(await embedFonts(await PDFDocument.create()));
  return cachedFonts;
}

export async function layoutForm(form: FormDef): Promise<Layout> {
  return computeLayout(form, await layoutFonts());
}

/** Characters in the form that the built-in PDF font cannot print. */
export async function unsupportedChars(form: FormDef): Promise<string[]> {
  const f = await layoutFonts();
  const all = JSON.stringify(form);
  return [...new Set(Array.from(all).filter((c) => c !== '\n' && f.clean(c) === '?' && c !== '?'))];
}

function drawOps(page: PDFPage, ops: DrawOp[], f: FontPair) {
  const Y = (mm: number) => PAGE_H - mm * K;
  for (const op of ops) {
    if (op.t === 'text') {
      const font = op.bold ? f.bold : f.regular;
      const w = font.widthOfTextAtSize(op.text, op.size);
      const x = op.x * K - (op.align === 'center' ? w / 2 : op.align === 'right' ? w : 0);
      page.drawText(op.text, { x, y: Y(op.y), size: op.size, font, color: grayscale(op.gray ?? 0) });
    } else if (op.t === 'rect') {
      page.drawRectangle({
        x: op.x * K, y: Y(op.y + op.h), width: op.w * K, height: op.h * K,
        color: op.fill === undefined ? undefined : grayscale(op.fill),
        borderColor: op.stroke === undefined ? undefined : grayscale(op.stroke),
        borderWidth: op.stroke === undefined ? 0 : (op.lw ?? 0.3) * K,
      });
    } else if (op.t === 'circle') {
      page.drawCircle({
        x: op.x * K, y: Y(op.y), size: op.r * K,
        color: op.fill === undefined ? undefined : grayscale(op.fill),
        borderColor: op.stroke === undefined ? undefined : grayscale(op.stroke),
        borderWidth: op.stroke === undefined ? 0 : (op.lw ?? 0.3) * K,
      });
    } else {
      page.drawLine({ start: { x: op.x1 * K, y: Y(op.y1) }, end: { x: op.x2 * K, y: Y(op.y2) }, thickness: op.lw * K, color: grayscale(op.stroke) });
    }
  }
}

function chromeOps(form: FormDef, layout: Layout, fonts: Fonts, pageNo: number): DrawOp[] {
  const g = layout.geometry;
  const ops: DrawOp[] = g.markers.map(([x, y]) => ({ t: 'rect', x: x - g.markerSize / 2, y: y - g.markerSize / 2, w: g.markerSize, h: g.markerSize, fill: 0 }));
  const title = fonts.clean(form.title || 'Questionnaire');
  const fit = (t: string, size: number, w: number, bold: boolean) => {
    let s = t;
    while (s.length > 1 && fonts.measure(s, size, bold) > w) s = s.slice(0, -2) + '…';
    return fonts.clean(s);
  };
  ops.push({ t: 'text', x: 17, y: 15, size: 13, bold: true, text: fit(title, 13, 112, true) });
  if (form.subtitle.trim()) ops.push({ t: 'text', x: 17, y: 21.5, size: 9, text: fit(form.subtitle, 9, 112, false), gray: 0.35 });
  ops.push({ t: 'text', x: 164, y: 21, size: 8, text: `Page ${pageNo} of ${layout.pages.length}`, align: 'right', gray: 0.35 });
  ops.push({ t: 'line', x1: 17, y1: 30, x2: 193, y2: 30, stroke: 0.3, lw: 0.4 });
  const lead = 'Fill circles fully:';
  const cx = 17 + fonts.measure(lead, 6.5) + 2.2;
  ops.push({ t: 'text', x: 17, y: 281, size: 6.5, text: lead, gray: 0.35 });
  ops.push({ t: 'circle', x: cx, y: 280.2, r: 1.3, fill: 0 });
  ops.push({ t: 'text', x: cx + 2.6, y: 281, size: 6.5, gray: 0.35, text: 'Use a dark pen. Keep the black corner squares and the code visible. Do not fold.' });
  ops.push({ t: 'text', x: 193, y: 281, size: 6.5, text: 'PsychScan', align: 'right', gray: 0.55 });
  return ops;
}

function qrPath(text: string): { path: string; n: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  let path = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.modules.get(r, c)) { c++; continue; }
      let e = c;
      while (e < n && qr.modules.get(r, e)) e++;
      path += `M${c} ${r}h${e - c}v1h${c - e}z`;
      c = e;
    }
  }
  return { path, n };
}

type RenderOpts = {
  form: FormDef;
  layout: Layout;
  formId: string;
  fp: string;
  serials: number[];
  attachment?: Uint8Array;
  preview?: boolean;
};

async function renderPdf(o: RenderOpts): Promise<Uint8Array> {
  const tpl = await PDFDocument.create();
  const tf = await embedFonts(tpl);
  const fonts = fontsFrom(tf);
  o.layout.pages.forEach((ops, i) => {
    const p = tpl.addPage([PAGE_W, PAGE_H]);
    drawOps(p, [...chromeOps(o.form, o.layout, fonts, i + 1), ...ops], tf);
  });

  const doc = await PDFDocument.create();
  const f = await embedFonts(doc);
  const templates = await doc.embedPdf(tpl, tpl.getPageIndices());
  const qr = o.layout.geometry.qr;

  for (const serial of o.serials) {
    templates.forEach((tp, i) => {
      const page = doc.addPage([PAGE_W, PAGE_H]);
      page.drawPage(tp, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
      const id = o.preview ? 'ID -----' : `ID ${formatSerial(serial)}`;
      const w = f.bold.widthOfTextAtSize(id, 12);
      page.drawText(id, { x: 164 * K - w, y: PAGE_H - 15 * K, size: 12, font: f.bold });
      const { path, n } = qrPath(encodeSheet({ formId: o.formId, fp: o.fp, serial, page: i + 1 }));
      page.drawSvgPath(path, { x: qr.x * K, y: PAGE_H - qr.y * K, scale: (qr.w * K) / n, color: grayscale(0), borderWidth: 0 });
      if (o.preview) page.drawText('PREVIEW — not for printing', { x: 60 * K, y: PAGE_H - 33 * K, size: 8, font: f.bold, color: grayscale(0.5) });
    });
  }

  doc.setTitle(o.form.title || 'Questionnaire');
  doc.setCreator('PsychScan');
  doc.setProducer('PsychScan (pdf-lib)');
  doc.setSubject('Paper questionnaire. Scan filled sheets with PsychScan to get a spreadsheet.');
  if (o.attachment) {
    await doc.attach(o.attachment, ATTACHMENT_NAME, {
      mimeType: 'application/json',
      description: 'PsychScan project file. Open this PDF in PsychScan to restore the project.',
    });
  }
  return doc.save();
}

export async function previewPdf(form: FormDef): Promise<{ bytes: Uint8Array; pages: number }> {
  const layout = await layoutForm(form);
  const bytes = await renderPdf({ form, layout, formId: 'preview', fp: '00000000', serials: [0], preview: true });
  return { bytes, pages: layout.pages.length };
}

/** Print-ready PDF for one batch of serials of a frozen version. */
export async function batchPdf(project: Project, version: Version, from: number, to: number): Promise<Uint8Array> {
  const layout = await layoutForm(version.form);
  const serials = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const forFile: Project = { ...project, responses: [] };
  const attachment = new TextEncoder().encode(JSON.stringify(forFile));
  return renderPdf({ form: version.form, layout, formId: project.id, fp: version.fp, serials, attachment });
}

/** Read the project file embedded in a PsychScan PDF, or null if there is none. */
export async function extractProjectFromPdf(bytes: Uint8Array): Promise<string | null> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const ef = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (!ef) return null;
  const found: string[] = [];
  const walk = (node: PDFDict) => {
    const arr = node.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (arr) {
      for (let i = 0; i + 1 < arr.size(); i += 2) {
        const name = arr.lookup(i);
        const label = name instanceof PDFString || name instanceof PDFHexString ? name.decodeText() : '';
        if (label !== ATTACHMENT_NAME) continue;
        const spec = arr.lookup(i + 1, PDFDict);
        const stream = spec.lookupMaybe(PDFName.of('EF'), PDFDict)?.lookup(PDFName.of('F'));
        if (stream instanceof PDFRawStream) found.push(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
      }
    }
    const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i, PDFDict));
  };
  walk(ef);
  return found[0] ?? null;
}
