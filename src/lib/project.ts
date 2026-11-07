import { fnv1a, stableStringify } from './hash';
import type { Layout } from './layout';
import { FILE_FORMAT, uid, type Batch, type Field, type FormDef, type Project, type Response, type Version } from './schema';

export function fingerprint(layout: Pick<Layout, 'geometry' | 'fields' | 'pages'>): string {
  return fnv1a(stableStringify({ g: layout.geometry, f: layout.fields, n: layout.pages.length }));
}

/** Return the version matching this layout, adding it to the project if new. */
export function freezeVersion(p: Project, form: FormDef, layout: Layout): { project: Project; version: Version } {
  const fp = fingerprint(layout);
  const existing = p.versions.find((v) => v.fp === fp);
  if (existing) return { project: p, version: existing };
  const version: Version = {
    fp, createdAt: new Date().toISOString(), pages: layout.pages.length,
    form: structuredClone(form), geometry: layout.geometry, fields: layout.fields,
  };
  return { project: { ...p, versions: [...p.versions, version] }, version };
}

export function overlappingBatch(p: Project, from: number, to: number): Batch | undefined {
  return p.batches.find((b) => from <= b.to && to >= b.from);
}

export function addBatch(p: Project, fp: string, from: number, count: number): { project: Project; batch: Batch } {
  const batch: Batch = { id: uid(6), fp, from, to: from + count - 1, createdAt: new Date().toISOString() };
  return {
    project: { ...p, batches: [...p.batches, batch], nextSerial: Math.max(p.nextSerial, batch.to + 1) },
    batch,
  };
}

export const versionIndex = (p: Project, fp: string) => p.versions.findIndex((v) => v.fp === fp) + 1;

/** All variables across versions: latest version's order first, then older-only ones. */
export function allFields(p: Project): Field[] {
  const seen = new Map<string, Field>();
  for (const v of [...p.versions].reverse()) for (const f of v.fields) if (!seen.has(f.var)) seen.set(f.var, f);
  return [...seen.values()];
}

export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a PsychScan project (it is not valid JSON).');
  }
  const p = data as Project;
  if (!p || p.format !== FILE_FORMAT || typeof p.id !== 'string' || !p.form || !Array.isArray(p.versions))
    throw new Error('This file is not a PsychScan project file.');
  p.batches ??= [];
  p.responses ??= [];
  p.nextSerial ??= 1;
  return p;
}

export type MergeReport = { addedVersions: number; addedBatches: number; addedResponses: number; conflicts: number[] };

/** Merge another copy of the same project (e.g. a teammate's scans) into `a`. `a` wins on conflicts. */
export function mergeProjects(a: Project, b: Project): { project: Project; report: MergeReport } {
  if (a.id !== b.id) throw new Error('These files belong to different projects, so they cannot be merged.');
  const versions = [...a.versions];
  const batches = [...a.batches];
  const responses = [...a.responses];
  const report: MergeReport = { addedVersions: 0, addedBatches: 0, addedResponses: 0, conflicts: [] };
  for (const v of b.versions) if (!versions.some((x) => x.fp === v.fp)) { versions.push(v); report.addedVersions++; }
  for (const bt of b.batches) if (!batches.some((x) => x.id === bt.id)) { batches.push(bt); report.addedBatches++; }
  for (const r of b.responses) {
    const i = responses.findIndex((x) => x.serial === r.serial);
    if (i < 0) { responses.push(r); report.addedResponses++; continue; }
    const mine = responses[i];
    const newPages = r.pages.filter((pg) => !mine.pages.includes(pg));
    if (mine.fp === r.fp && newPages.length) {
      const pageVars = new Set(versions.find((v) => v.fp === r.fp)?.fields.filter((f) => newPages.includes(f.page)).map((f) => f.var));
      const pick = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => pageVars.has(k)));
      responses[i] = {
        ...mine,
        pages: [...mine.pages, ...newPages].sort((x, y) => x - y),
        values: { ...mine.values, ...pick(r.values) },
        flags: { ...mine.flags, ...pick(r.flags) },
        crops: { ...mine.crops, ...pick(r.crops) },
      };
    } else if (stableStringify(mine.values) !== stableStringify(r.values)) {
      report.conflicts.push(r.serial);
    }
  }
  responses.sort((x, y) => x.serial - y.serial);
  return {
    project: {
      ...a, versions, batches, responses,
      nextSerial: Math.max(a.nextSerial, b.nextSerial),
      updatedAt: new Date().toISOString(),
    },
    report,
  };
}

export function missingPages(p: Project, r: Response): number[] {
  const v = p.versions.find((x) => x.fp === r.fp);
  if (!v) return [];
  return Array.from({ length: v.pages }, (_, i) => i + 1).filter((pg) => !r.pages.includes(pg));
}

export function unresolvedCount(r: Response): number {
  return Object.keys(r.flags).length;
}
