import { describe, expect, it } from 'vitest';
import { exampleProject } from '../src/lib/example';
import { dataTable, toCsv } from '../src/lib/export';
import { layoutForm } from '../src/lib/pdf';
import {
  addBatch, addReservation, applyPage, deleteResponses, freezeVersion, lockConflicts, mergeProjects, nextFreeSerial,
  printedCount, resolveClash, serialProblem, setAnswer,
} from '../src/lib/project';
import { validateForm, type Project, type Version } from '../src/lib/schema';

async function printed(): Promise<{ p: Project; v: Version }> {
  const p0 = exampleProject();
  const fv = freezeVersion(p0, p0.form, await layoutForm(p0.form));
  return { p: addBatch(fv.project, fv.version.fp, 1, 10).project, v: fv.version };
}
const page = (v: Version, serial: number, pg: number, val: number) => ({
  serial, fp: v.fp, page: pg, crops: {},
  fields: Object.fromEntries(v.fields.filter((f) => f.page === pg).map((f) => [f.var, { value: f.type === 'text' ? null : f.type === 'check' ? 0 : f.type === 'digits' ? 20 + val : f.marks[val % f.marks.length].value }])),
});

describe('project safety', async () => {
  const { p, v } = await printed();

  it('counts printed copies correctly when the first serial is not 1', () => {
    expect(printedCount(addBatch(p, v.fp, 1000, 20).project)).toBe(30);
  });

  it('gives teammates separate ranges and blocks printing into someone else’s', () => {
    let q = addReservation(p, 'Riya', 101, 200);
    expect(nextFreeSerial(q)).toBe(11);
    expect(nextFreeSerial(q, 'Riya')).toBe(101);
    expect(serialProblem(q, 150, 160)).toMatch(/reserved for Riya/);
    expect(serialProblem(q, 150, 160, 'Riya')).toBeNull();
    q = addBatch(q, v.fp, 101, 20, 'Riya').project;
    expect(nextFreeSerial(q, 'Riya')).toBe(121);
    expect(serialProblem(q, 5, 12)).toMatch(/already printed/);
  });

  it('merging two teammates who printed the same IDs never drops or splices a participant', () => {
    const a = applyPage(addBatch(p, v.fp, 11, 10).project, page(v, 12, 1, 1), false).project;
    const b0 = applyPage(applyPage(addBatch(p, v.fp, 11, 10).project, page(v, 12, 1, 2), false).project, page(v, 13, 2, 3), false).project;
    const a2 = applyPage(a, page(v, 13, 1, 1), false).project;
    const { project: m, report } = mergeProjects(a2, b0, 'riya.tallyleaf');
    expect(report.clashes.sort()).toEqual([12, 13]);
    expect(m.responses.find((r) => r.serial === 13)!.pages).toEqual([1]);
    const both = resolveClash(m, 0, 'both');
    expect(both.responses.filter((r) => r.originalSerial === 12)).toHaveLength(1);
  });

  it('merging a teammate’s scan of the other page of the same person joins them', () => {
    const a = applyPage(p, page(v, 3, 1, 1), false).project;
    const b = applyPage(p, page(v, 3, 2, 1), false).project;
    const { project: m, report } = mergeProjects(a, b);
    expect(report.clashes).toEqual([]);
    expect(m.responses.find((r) => r.serial === 3)!.pages).toEqual([1, 2]);
  });

  it('deleted participants stay deleted when an older file is merged back', () => {
    const withTwo = applyPage(applyPage(p, page(v, 4, 1, 1), false).project, page(v, 5, 1, 1), false).project;
    const old = structuredClone(withTwo);
    const after = deleteResponses(withTwo, [4]);
    const { project: m, report } = mergeProjects(after, old);
    expect(m.responses.map((r) => r.serial)).toEqual([5]);
    expect(report.skippedDeleted).toEqual([4]);
    expect(applyPage(m, page(v, 4, 1, 2), false).project.responses.map((r) => r.serial)).toEqual([4, 5]);
  });

  it('refuses to change stored values of printed questions', () => {
    const f = structuredClone(p.form);
    const study = f.blocks.find((b) => b.kind === 'likert' && b.items[0].varName === 'study1');
    if (study?.kind === 'likert') study.options = study.options.map((o) => ({ ...o, value: o.value - 1 }));
    expect(lockConflicts(p, f).join(' ')).toMatch(/study1/);
    expect(lockConflicts(p, p.form)).toEqual([]);
  });

  it('logs every manual correction', () => {
    const q = setAnswer(applyPage(p, page(v, 6, 1, 1), false).project, 6, 'gad1', 3);
    expect(q.log?.at(-1)).toMatchObject({ serial: 6, var: 'gad1', to: 3 });
  });

  it('rejects names that break SPSS', () => {
    const f = structuredClone(p.form);
    const lik = f.blocks.find((b) => b.kind === 'likert');
    if (lik?.kind === 'likert') { lik.items[0].varName = 'to'; lik.items[1].subscale = 'self-esteem'; lik.items[2].varName = 'gad7_sum'; }
    const errs = validateForm(f).join('\n');
    expect(errs).toMatch(/reserved word/);
    expect(errs).toMatch(/Subscale name "self-esteem"/);
    expect(errs).toMatch(/gad7_sum/);
  });

  it('CSV keeps one line per participant and neutralises formulas', () => {
    let q = applyPage(p, page(v, 7, 2, 1), false).project;
    q = setAnswer(q, 7, 'comments', 'line one\nline two');
    q = applyPage(q, page(v, 8, 2, 1), false).project;
    q = setAnswer(q, 8, 'comments', '=HYPERLINK("x")');
    const csv = toCsv(dataTable(q)).trim().split('\r\n');
    expect(csv).toHaveLength(3);
    expect(csv.join('\n')).toContain("'=HYPERLINK");
  });
});
