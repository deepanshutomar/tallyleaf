import { createCanvas } from '@napi-rs/canvas';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../cli/main';
import { parseQuestionnaire, questionnaireToYaml } from '../cli/spec';
import { exampleProject } from '../src/lib/example';
import { blockVars } from '../src/lib/schema';
import { fillPage, mulberry, photograph, renderPdf } from './helpers';

async function cli(...argv: string[]) {
  const lines: string[] = [];
  const code = await run([...argv, '--json'], { log: (s = '') => lines.push(s), err: (s) => lines.push(s) });
  return { code, data: JSON.parse(lines.join('\n')) };
}

function saveJpg(img: { width: number; height: number; data: Uint8ClampedArray }, file: string) {
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(img.data);
  ctx.putImageData(id, 0, 0);
  writeFileSync(file, c.toBuffer('image/jpeg', 85));
}

describe('questionnaire file format', () => {
  it('round-trips the example questionnaire', () => {
    const form = exampleProject().form;
    const back = parseQuestionnaire(questionnaireToYaml(form));
    expect(back.blocks.flatMap(blockVars)).toEqual(form.blocks.flatMap(blockVars));
    const study2 = back.blocks.flatMap((b) => (b.kind === 'likert' ? b.items : [])).find((i) => i.varName === 'study2');
    expect(study2).toMatchObject({ reverse: true, subscale: 'study' });
  });

  it('explains every problem in plain words', () => {
    expect(() => parseQuestionnaire('title: X\nblocks:\n  - single: gender\n    question: Gender\n  - scale:\n      options: agree-9\n      items: [a1: Hi]\n  - single: to\n    question: Q\n    options: [A, B]'))
      .toThrow(/options" is missing[\s\S]*unknown preset "agree-9"/);
    expect(() => parseQuestionnaire('title: X\nblocks:\n  - single: to\n    question: Q\n    options: [A, B]')).toThrow(/reserved word/);
  });
});

describe('command-line workflow', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tallyleaf-'));
  const q = join(dir, 'questionnaire.yaml');
  const study = join(dir, 'study.tallyleaf');

  it('init → check → new → print', async () => {
    expect((await cli('init', q)).code).toBe(0);
    const check = await cli('check', q);
    expect(check.data).toMatchObject({ ok: true, pagesPerCopy: 2 });
    expect((await cli('new', q, '-o', study)).code).toBe(0);
    const print = await cli('print', study, '--copies', '3', '-o', join(dir, 'batch.pdf'));
    expect(print.data).toMatchObject({ ok: true, from: 1, to: 3 });
    expect((await cli('print', study, '--copies', '2', '--start', '2', '-o', join(dir, 'x.pdf'))).data.error).toMatch(/already printed/);
  });

  it('scans a shuffled folder of photos, reviews, corrects and exports', async () => {
    const project = JSON.parse(readFileSync(study, 'utf8'));
    const v = project.versions[0];
    const pages = await renderPdf(new Uint8Array(readFileSync(join(dir, 'batch.pdf'))), 7);
    const photos = join(dir, 'photos');
    mkdirSync(photos);
    const rng = mulberry(77);
    const answers: Record<number, Record<string, number | null>> = {};
    pages.forEach((img, idx) => {
      const serial = 1 + Math.floor(idx / v.pages);
      const pg = (idx % v.pages) + 1;
      answers[serial] ??= Object.fromEntries(v.fields.map((f: { var: string; type: string; marks: { value: number }[] }) => [f.var,
        f.type === 'choice' ? f.marks[Math.floor(rng() * f.marks.length)].value : f.type === 'check' ? (f.var.endsWith('_1') ? 1 : rng() < 0.5 ? 1 : 0) : f.type === 'digits' ? 20 + serial : 1]));
      const filled = fillPage(img, 7, v, pg, answers[serial], () => (rng() < 0.6 ? 'fill' : 'tick'), rng);
      saveJpg(photograph(filled, 1200, 1650, [[70, 60], [1130, 40], [1160, 1600], [50, 1620]], rng, 0.25), join(photos, `IMG_${9000 - idx}.jpg`));
    });
    const scan = await cli('scan', study, photos);
    expect(scan.data.read).toBe(6);
    expect(scan.data.failed).toBe(0);

    const review = await cli('review', study, '--crops', join(dir, 'review'));
    const comment = review.data.items.find((i: { column: string }) => i.column === 'comments');
    expect(comment).toMatchObject({ flag: 'text' });
    expect(existsSync(comment.image)).toBe(true);
    expect((await cli('set', study, String(comment.id), 'comments=Felt calm', 'gad1=3')).code).toBe(0);
    expect((await cli('set', study, '1', 'gad1=7')).data.error).toMatch(/must be one of/);

    const exp = await cli('export', study, '-o', join(dir, 'export'));
    expect(exp.data.files).toHaveLength(5);
    const csv = readFileSync(join(dir, 'export', 'student-wellbeing-survey.csv'), 'utf8').replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(','));
    const head = csv[0];
    let checked = 0;
    for (const row of csv.slice(1)) {
      const serial = Number(row[0]);
      for (const [k, want] of Object.entries(answers[serial])) {
        if (k === 'comments' || (k === 'gad1' && serial === comment.id)) continue;
        expect(row[head.indexOf(k)], `ID ${serial} ${k}`).toBe(String(want));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
    const log = readFileSync(join(dir, 'export', 'student-wellbeing-survey_corrections.csv'), 'utf8');
    expect(log).toContain('Felt calm');
  });

  it('writes a Google Form script and guides agents', async () => {
    const g = await cli('gform', q, '-o', join(dir, 'form.gs'));
    expect(g.data.steps.length).toBeGreaterThan(4);
    expect(readFileSync(join(dir, 'form.gs'), 'utf8')).toContain('function createForm()');
    const lines: string[] = [];
    await run(['guide'], { log: (s = '') => lines.push(s), err: () => undefined });
    expect(lines.join('\n')).toContain('name: tallyleaf');
  });

  it('AGENTS.md matches the agent manual, and the schema command works', async () => {
    const manual = readFileSync(join(__dirname, '..', 'skills', 'tallyleaf', 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\s*/, '').trimEnd();
    expect(readFileSync(join(__dirname, '..', 'AGENTS.md'), 'utf8')).toContain(manual);
    const lines: string[] = [];
    await run(['schema'], { log: (s = '') => lines.push(s), err: () => undefined });
    expect(JSON.parse(lines.join('\n')).title).toBe('Tallyleaf questionnaire');
  });

  it('the built command runs on its own', () => {
    const bin = join(__dirname, '..', 'bin', 'tallyleaf.js');
    if (!existsSync(bin)) return;
    expect(execFileSync('node', [bin, '--version'], { encoding: 'utf8' })).toMatch(/tallyleaf \d/);
    expect(readdirSync(join(__dirname, '..', 'bin'))).toEqual(['tallyleaf.js']);
  });
});
