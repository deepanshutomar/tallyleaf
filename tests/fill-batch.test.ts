// Dev helper: FILL_PDF=batch.pdf FILL_OUT=dir npx vitest run tests/fill-batch.test.ts
import { it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { extractProjectFromPdf } from '../src/lib/pdf';
import { parseProject } from '../src/lib/project';
import { fillPage, mulberry, photograph, renderPdf } from './helpers';

const PDF = process.env.FILL_PDF;
const OUT = process.env.FILL_OUT;

it.skipIf(!PDF || !OUT)('fill a generated batch and save shuffled photos', async () => {
  const bytes = new Uint8Array(readFileSync(PDF!));
  const project = parseProject((await extractProjectFromPdf(bytes))!);
  const v = project.versions[0];
  const pages = await renderPdf(bytes, 7);
  const rng = mulberry(42);
  const answers: Record<number, Record<string, number | null>> = {};
  const files: string[] = [];
  pages.forEach((img, idx) => {
    const serial = project.batches[0].from + Math.floor(idx / v.pages);
    const pg = (idx % v.pages) + 1;
    answers[serial] ??= Object.fromEntries(v.fields.map((f) => [f.var,
      f.type === 'choice' ? f.marks[Math.floor(rng() * f.marks.length)].value : f.type === 'check' ? (rng() < 0.5 ? 1 : 0) : f.type === 'digits' ? 19 + Math.floor(rng() * 30) : 1]));
    let out = fillPage(img, 7, v, pg, answers[serial], () => (rng() < 0.7 ? 'fill' : 'tick'), rng);
    out = photograph(out, 1200, 1650, [[80 + rng() * 60, 60 + rng() * 40], [1120 - rng() * 60, 50 + rng() * 40], [1150 - rng() * 40, 1600 - rng() * 40], [60 + rng() * 40, 1610 - rng() * 30]], rng, 0.3);
    const c = createCanvas(out.width, out.height);
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(out.width, out.height);
    id.data.set(out.data);
    ctx.putImageData(id, 0, 0);
    const name = `photo_${String(Math.floor(rng() * 1e6)).padStart(6, '0')}.jpg`;
    writeFileSync(`${OUT}/${name}`, c.toBuffer('image/jpeg', 85));
    files.push(name);
  });
  writeFileSync(`${OUT}/answers.json`, JSON.stringify({ answers, files }, null, 1));
});
