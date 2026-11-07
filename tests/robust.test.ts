import { describe, expect, it } from 'vitest';
import { batchPdf, layoutForm } from '../src/lib/pdf';
import { addBatch, freezeVersion } from '../src/lib/project';
import { scanPage, type RGBA } from '../src/lib/scan';
import { newProject, uid, type Project, type Version } from '../src/lib/schema';
import { fillPage, mulberry, photograph, renderPdf, type Style } from './helpers';

const PPM = 8;

async function make(): Promise<{ project: Project; version: Version; pages: RGBA[] }> {
  let project = newProject('Robustness');
  project.form.blocks = [
    { kind: 'number', id: uid(6), varName: 'code', text: 'Participant code', digits: 3, keepZeros: true },
    { kind: 'multi', id: uid(6), varName: 'hob', text: 'Hobbies', options: ['Music', 'Sport', 'Reading', 'A much longer option label that needs to wrap onto a second line on paper'] },
    { kind: 'likert', id: uid(6), title: 'Agree?', options: [1, 2, 3, 4, 5].map((v) => ({ label: `L${v}`, value: v })),
      items: Array.from({ length: 8 }, (_, i) => ({ id: uid(6), varName: `it${i + 1}`, text: `Statement ${i + 1}` })) },
    { kind: 'open', id: uid(6), varName: 'note', text: 'Anything else?', lines: 3 },
  ];
  const layout = await layoutForm(project.form);
  const fv = freezeVersion(project, project.form, layout);
  project = addBatch(fv.project, fv.version.fp, 1, 1).project;
  const pages = await renderPdf(await batchPdf(project, fv.version, 1, 1), PPM);
  return { project, version: fv.version, pages };
}

describe('scanner robustness', async () => {
  const { project, version, pages } = await make();
  const lookup = () => version;
  const choiceAnswers = (rng: () => number) => Object.fromEntries(version.fields.filter((f) => f.type === 'choice').map((f) => [f.var, f.marks[Math.floor(rng() * 5)].value]));

  const keystone = (img: RGBA, bottom: number, rng: () => number) => {
    const W = 1500, H = 2000, inset = ((1 - bottom) * 1300) / 2;
    return photograph(img, W, H, [[100, 80], [1400, 80], [1400 - inset, 1900], [100 + inset, 1900]], rng, 0.2);
  };

  for (const bottom of [0.85, 0.75, 0.68]) {
    it(`reads a photo with ${Math.round((1 - bottom) * 100)}% keystone`, () => {
      const rng = mulberry(5);
      const ans = choiceAnswers(rng);
      const res = scanPage(keystone(fillPage(pages[0], PPM, version, 1, ans, () => 'fill', rng), bottom, rng), lookup);
      expect(res.ok ? '' : res.error).toBe('');
      if (!res.ok) return;
      for (const [k, v] of Object.entries(ans)) expect(res.fields[k].value, k).toBe(v);
    });
  }

  it('accepts thin ticks without flagging most of them', () => {
    const rng = mulberry(9);
    const ans = choiceAnswers(rng);
    const res = scanPage(fillPage(pages[0], PPM, version, 1, ans, () => 'thin' as Style, rng), lookup);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const wrong = Object.entries(ans).filter(([k, v]) => res.fields[k].value !== v);
    const flagged = Object.keys(ans).filter((k) => res.fields[k].flag);
    expect(wrong).toEqual([]);
    expect(flagged.length).toBeLessThanOrEqual(2);
  });

  it('never drops open answers: short and pencil writing are kept for review', () => {
    for (const kind of [1, 2, 3]) {
      const rng = mulberry(kind);
      const res = scanPage(photograph(fillPage(pages[0], PPM, version, 1, { note: kind }, () => 'fill', rng), 1400, 1950, [[60, 50], [1340, 60], [1350, 1900], [50, 1890]], rng, 0.25), lookup);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.fields.note.flag, `kind ${kind}`).toBe('text');
      expect(res.crops.note).toBeDefined();
    }
  });

  it('does not mistake photo noise in an empty box for writing', () => {
    for (const seed of [11, 12, 13]) {
      const rng = mulberry(seed);
      const res = scanPage(photograph(fillPage(pages[0], PPM, version, 1, {}, () => 'fill', rng), 1400, 1950, [[60, 50], [1340, 60], [1350, 1900], [50, 1890]], rng, 0.35), lookup);
      expect(res.ok && res.fields.note.flag, `seed ${seed}`).toBe('text-empty');
    }
  });

  it('marks an empty answer box as probably empty (still with a picture)', () => {
    const res = scanPage(pages[0], lookup);
    expect(res.ok && res.fields.note.flag).toBe('text-empty');
    expect(res.ok && res.crops.note).toBeDefined();
  });

  it('recognises the blank printout as an empty page', () => {
    const res = scanPage(pages[0], lookup);
    expect(res.ok && res.empty).toBe(true);
  });

  it('flags a tick-all question with nothing ticked', () => {
    const rng = mulberry(2);
    const res = scanPage(fillPage(pages[0], PPM, version, 1, choiceAnswers(rng), () => 'fill', rng), lookup);
    expect(res.ok && res.fields.hob_1.flag).toBe('group-empty');
    expect(res.ok && res.empty).toBe(false);
  });

  it('keeps leading zeros in codes', () => {
    const rng = mulberry(4);
    const res = scanPage(fillPage(pages[0], PPM, version, 1, { code: 7 }, () => 'fill', rng), lookup);
    expect(res.ok && res.fields.code.value).toBe('007');
  });

  it('reads a washed-out photo', () => {
    const rng = mulberry(6);
    const ans = choiceAnswers(rng);
    const img = fillPage(pages[0], PPM, version, 1, ans, () => 'fill', rng);
    const data = new Uint8ClampedArray(img.data);
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = 150 + data[i + c] * 0.42;
    const res = scanPage({ ...img, data }, lookup);
    expect(res.ok ? '' : res.error).toBe('');
    if (res.ok) for (const [k, v] of Object.entries(ans)) expect(res.fields[k].value, k).toBe(v);
  });

  it('project has one printed page', () => expect(project.batches.length).toBe(1));
});
