import { describe, expect, it } from 'vitest';
import { exampleProject } from '../src/lib/example';
import { batchPdf, extractProjectFromPdf, layoutForm } from '../src/lib/pdf';
import { addBatch, freezeVersion, parseProject } from '../src/lib/project';
import { scanPage, type RGBA } from '../src/lib/scan';
import type { Field, Project, Version } from '../src/lib/schema';
import { fillPage, mulberry, photograph, renderPdf, type Style } from './helpers';

const PPM = 8;

async function setup(): Promise<{ project: Project; version: Version; pages: RGBA[] }> {
  let project = exampleProject();
  const layout = await layoutForm(project.form);
  const fv = freezeVersion(project, project.form, layout);
  project = addBatch(fv.project, fv.version.fp, 41, 2).project;
  const bytes = await batchPdf(project, fv.version, 41, 42);
  const pages = await renderPdf(bytes, PPM);
  return { project, version: fv.version, pages };
}

function randomAnswers(v: Version, rng: () => number): Record<string, number | null> {
  const a: Record<string, number | null> = {};
  for (const f of v.fields) {
    if (f.type === 'choice') a[f.var] = rng() < 0.06 ? null : f.marks[Math.floor(rng() * f.marks.length)].value;
    else if (f.type === 'check') a[f.var] = rng() < 0.5 ? 1 : 0;
    else if (f.type === 'digits') a[f.var] = 18 + Math.floor(rng() * 40);
    else a[f.var] = 1;
  }
  return a;
}

function compare(v: Version, page: number, answers: Record<string, number | null>, img: RGBA, project: Project) {
  const res = scanPage(img, (s) => (s.formId === project.id ? project.versions.find((x) => x.fp === s.fp) ?? 'unknown version' : 'other project'));
  if (!res.ok) throw new Error(res.error);
  const wrong: string[] = [];
  const flagged: string[] = [];
  for (const f of v.fields.filter((x) => x.page === page)) {
    const r = res.fields[f.var];
    if (f.type === 'text') { if (r.flag !== 'text') wrong.push(`${f.var}: text not detected`); continue; }
    const want = answers[f.var];
    if (r.value !== want) wrong.push(`${f.var}: want ${want} got ${r.value} [${r.scores.map((s) => s.toFixed(2)).join(' ')}]`);
    if (r.flag && !(want === null && r.flag === 'blank')) flagged.push(`${f.var}:${r.flag} [${r.scores.map((s) => s.toFixed(2)).join(' ')}]`);
  }
  return { res, wrong, flagged };
}

describe('generate → fill → photograph → scan', async () => {
  const { project, version, pages } = await setup();

  it('produces the expected pages', () => {
    expect(version.pages).toBeGreaterThanOrEqual(2);
    expect(pages.length).toBe(version.pages * 2);
  });

  it('restores the project from the PDF attachment', async () => {
    const bytes = await batchPdf(project, version, 41, 41);
    const text = await extractProjectFromPdf(bytes);
    expect(text).not.toBeNull();
    const p = parseProject(text!);
    expect(p.id).toBe(project.id);
    expect(p.versions[0].fp).toBe(version.fp);
    expect(p.nextSerial).toBe(43);
  });

  const scenarios: { name: string; style: (f: Field, rng: () => number) => Style; warp: (w: number, h: number, rng: () => number) => { W: number; H: number; c: [number, number][]; light: number } }[] = [
    { name: 'flat scan, filled bubbles', style: () => 'fill', warp: (w, h) => ({ W: w, H: h, c: [[0, 0], [w, 0], [w, h], [0, h]], light: 0 }) },
    {
      name: 'tilted phone photo, mixed fill/tick/cross',
      style: (_f, rng) => (['fill', 'tick', 'cross'] as Style[])[Math.floor(rng() * 3)],
      warp: () => ({ W: 1500, H: 2000, c: [[150, 120], [1330, 60], [1420, 1880], [90, 1950]], light: 0.35 }),
    },
    {
      name: 'upside-down low-res photo',
      style: () => 'fill',
      warp: () => ({ W: 1100, H: 1500, c: [[1040, 1440], [60, 1420], [90, 60], [1010, 90]], light: 0.2 }),
    },
  ];

  for (const sc of scenarios) {
    it(sc.name, () => {
      const rng = mulberry(sc.name.length * 7919);
      for (let pg = 1; pg <= version.pages; pg++) {
        const answers = randomAnswers(version, rng);
        const filled = fillPage(pages[pg - 1], PPM, version, pg, answers, (f) => sc.style(f, rng), rng);
        const w = sc.warp(filled.width, filled.height, rng);
        const photo = w.light === 0 && w.W === filled.width ? filled : photograph(filled, w.W, w.H, w.c, rng, w.light);
        const { res, wrong, flagged } = compare(version, pg, answers, photo, project);
        if (wrong.length || flagged.length) console.log(sc.name, 'page', pg, { wrong, flagged });
        expect(res.ok && res.sheet.serial).toBe(41);
        expect(res.ok && res.sheet.page).toBe(pg);
        expect(wrong).toEqual([]);
      }
    });
  }

  it('reports a sheet from another project', () => {
    const res = scanPage(pages[0], () => 'This sheet belongs to a different project.');
    expect(res.ok).toBe(false);
  });

  it('flags double marks and faint marks', () => {
    const rng = mulberry(3);
    const f = version.fields.find((x) => x.type === 'choice' && x.page === 1)!;
    const answers: Record<string, number | null> = { [f.var]: f.marks[1].value };
    let img = fillPage(pages[0], PPM, version, 1, answers, () => 'fill', rng);
    img = fillPage(img, PPM, version, 1, { [f.var]: f.marks[2].value }, () => 'fill', rng);
    const g = version.fields.filter((x) => x.type === 'choice' && x.page === 1)[1];
    img = fillPage(img, PPM, version, 1, { [g.var]: g.marks[0].value }, () => 'faint', rng);
    const res = scanPage(img, () => version);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields[f.var].flag).toBe('multiple');
    expect(res.fields[g.var].flag).toBe('faint');
  });
});
