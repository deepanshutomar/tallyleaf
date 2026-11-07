import { it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { exampleProject } from '../src/lib/example';
import { batchPdf, layoutForm } from '../src/lib/pdf';
import { freezeVersion } from '../src/lib/project';
import { fillPage, mulberry, photograph, renderPdf } from './helpers';
const OUT = process.env.DUMP_DIR;
it.skipIf(!OUT)('dump sample pages', async () => {
  const p = exampleProject();
  const fv = freezeVersion(p, p.form, await layoutForm(p.form));
  const bytes = await batchPdf(fv.project, fv.version, 1, 1);
  writeFileSync(`${OUT}/sample.pdf`, bytes);
  const pages = await renderPdf(bytes, 6);
  const rng = mulberry(1);
  pages.forEach((img, i) => {
    const ans: Record<string, number> = {};
    for (const f of fv.version.fields) ans[f.var] = f.type === 'digits' ? 23 : f.marks[Math.floor(rng() * f.marks.length)]?.value ?? 1;
    let out = fillPage(img, 6, fv.version, i + 1, ans, () => (rng() < 0.5 ? 'fill' : 'tick'), rng);
    if (i === 0) out = photograph(out, 1100, 1500, [[110, 90], [1000, 50], [1060, 1430], [70, 1460]], rng, 0.3);
    const c = createCanvas(out.width, out.height);
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(out.width, out.height);
    id.data.set(out.data);
    ctx.putImageData(id, 0, 0);
    writeFileSync(`${OUT}/page${i + 1}.png`, c.toBuffer('image/png'));
  });
});
