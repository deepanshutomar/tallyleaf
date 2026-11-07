import { fnv1a, stableStringify } from './hash';
import type { Layout } from './layout';
import { FILE_FORMAT, blockVars, uid, type Batch, type Clash, type Field, type Flag, type FormDef, type Project, type Reservation, type Response, type Version } from './schema';

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

export const printedCount = (p: Project) => p.batches.reduce((n, b) => n + b.to - b.from + 1, 0);

const used = (p: Project, n: number) => p.batches.some((b) => n >= b.from && n <= b.to);

/** First free serial: inside the teammate's range if given, otherwise after everything printed or reserved. */
export function nextFreeSerial(p: Project, by?: string): number {
  const res = p.reservations?.find((r) => r.name === by);
  if (res) {
    for (let n = res.from; n <= res.to; n++) if (!used(p, n)) return n;
    return res.to + 1;
  }
  let n = Math.max(1, p.nextSerial);
  for (let guard = 0; guard < 1e6; guard++) {
    const r = p.reservations?.find((x) => n >= x.from && n <= x.to);
    if (r) { n = r.to + 1; continue; }
    if (used(p, n)) { n++; continue; }
    return n;
  }
  return n;
}

/** Why printing these serials would be unsafe, or null. */
export function serialProblem(p: Project, from: number, to: number, by?: string): string | null {
  const b = overlappingBatch(p, from, to);
  if (b) return `IDs ${b.from}–${b.to} were already printed${b.by ? ` by ${b.by}` : ''}. Two sheets with the same ID would be mixed up as one person.`;
  const r = p.reservations?.find((x) => x.name !== by && from <= x.to && to >= x.from);
  if (r) return `IDs ${r.from}–${r.to} are reserved for ${r.name}. Pick IDs outside that range, or choose “${r.name}” as the person printing.`;
  const mine = p.reservations?.find((x) => x.name === by);
  if (mine && (from < mine.from || to > mine.to)) return `${mine.name}'s range is ${mine.from}–${mine.to}. This batch goes outside it.`;
  return null;
}

export function addBatch(p: Project, fp: string, from: number, count: number, by?: string): { project: Project; batch: Batch } {
  const batch: Batch = { id: uid(6), fp, from, to: from + count - 1, createdAt: new Date().toISOString(), ...(by ? { by } : {}) };
  return {
    project: { ...p, batches: [...p.batches, batch], nextSerial: by ? p.nextSerial : Math.max(p.nextSerial, batch.to + 1) },
    batch,
  };
}

export function addReservation(p: Project, name: string, from: number, to: number): Project {
  const r: Reservation = { id: uid(6), name: name.trim(), from, to };
  return { ...p, reservations: [...(p.reservations ?? []), r] };
}

/** Variables that are already on paper, with how they were printed. */
export function printedFields(p: Project): Map<string, Field> {
  const m = new Map<string, Field>();
  for (const v of p.versions) for (const f of v.fields) m.set(f.var, f);
  return m;
}

/** Changes to the draft that would make old and new sheets mean different things. */
export function lockConflicts(p: Project, form: FormDef): string[] {
  const printed = printedFields(p);
  const out: string[] = [];
  for (const b of form.blocks) {
    if (b.kind !== 'likert' && b.kind !== 'single') continue;
    const values = b.options.map((o) => o.value).join(',');
    for (const v of blockVars(b)) {
      const f = printed.get(v);
      if (f?.type === 'choice' && f.valueLabels && f.valueLabels.map((o) => o.value).join(',') !== values)
        out.push(`"${v}" was printed with options stored as ${f.valueLabels.map((o) => o.value).join('/')}. Changing that would mix two codings in one column. Undo the change, or ask a new question with a new column name.`);
    }
  }
  return out;
}

export const versionIndex = (p: Project, fp: string) => p.versions.findIndex((v) => v.fp === fp) + 1;

/** All variables across versions: latest version's order first, then older-only ones. */
export function allFields(p: Project): Field[] {
  const seen = new Map<string, Field>();
  for (const v of [...p.versions].reverse()) for (const f of v.fields) if (!seen.has(f.var)) seen.set(f.var, f);
  return [...seen.values()];
}

/** The field as it was printed on this participant's sheet (falls back to the latest definition). */
export function fieldFor(p: Project, r: Response, v: string): Field | undefined {
  return p.versions.find((x) => x.fp === r.fp)?.fields.find((f) => f.var === v);
}

export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Tallyleaf project (it is not valid JSON).');
  }
  const p = data as Project;
  if (!p || (p.format !== FILE_FORMAT && (p.format as string) !== 'psyform') || typeof p.id !== 'string' || !p.form || !Array.isArray(p.versions))
    throw new Error('This file is not a Tallyleaf project file.');
  p.format = FILE_FORMAT;
  p.batches ??= [];
  p.responses ??= [];
  p.nextSerial ??= 1;
  return p;
}

export type MergeReport = { addedVersions: number; addedBatches: number; addedResponses: number; clashes: number[]; skippedDeleted: number[] };

const clashingBatches = (a: Project, b: Project) =>
  b.batches.filter((x) => !a.batches.some((y) => y.id === x.id)).flatMap((x) =>
    a.batches.filter((y) => y.id !== x.id && !b.batches.some((z) => z.id === y.id) && x.from <= y.to && x.to >= y.from).map((y) => [Math.max(x.from, y.from), Math.min(x.to, y.to)] as const));

/** Merge another copy of the same project (e.g. a teammate's scans). Never drops or splices answers. */
export function mergeProjects(a: Project, b: Project, source = 'the other file'): { project: Project; report: MergeReport } {
  if (a.id !== b.id) throw new Error('These files belong to different projects, so they cannot be merged.');
  const versions = [...a.versions];
  const batches = [...a.batches];
  const responses = [...a.responses];
  const clashes: Clash[] = [...(a.clashes ?? [])];
  const deleted = [...(a.deleted ?? [])];
  for (const d of b.deleted ?? []) if (!deleted.some((x) => x.serial === d.serial)) deleted.push(d);
  const report: MergeReport = { addedVersions: 0, addedBatches: 0, addedResponses: 0, clashes: [], skippedDeleted: [] };
  const clashRanges = clashingBatches(a, b);
  const inClash = (n: number) => clashRanges.some(([f, t]) => n >= f && n <= t);
  for (const v of b.versions) if (!versions.some((x) => x.fp === v.fp)) { versions.push(v); report.addedVersions++; }
  for (const bt of b.batches) if (!batches.some((x) => x.id === bt.id)) { batches.push(bt); report.addedBatches++; }
  const now = new Date().toISOString();
  for (const r of b.responses) {
    const del = deleted.find((d) => d.serial === r.serial);
    if (del && r.scannedAt <= del.at) { report.skippedDeleted.push(r.serial); continue; }
    const i = responses.findIndex((x) => x.serial === r.serial);
    if (i < 0) { responses.push(r); report.addedResponses++; continue; }
    const mine = responses[i];
    if (stableStringify(mine) === stableStringify(r)) continue;
    const newPages = r.pages.filter((pg) => !mine.pages.includes(pg));
    const v = versions.find((x) => x.fp === r.fp);
    const varsOn = (pages: number[]) => new Set(v?.fields.filter((f) => pages.includes(f.page)).map((f) => f.var));
    const overlap = varsOn(r.pages.filter((pg) => mine.pages.includes(pg)));
    const sameOverlap = [...overlap].every((k) => (mine.values[k] ?? null) === (r.values[k] ?? null));
    if (mine.fp === r.fp && !inClash(r.serial) && sameOverlap) {
      const add = varsOn(newPages);
      const pick = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => add.has(k)));
      if (newPages.length) {
        responses[i] = {
          ...mine,
          pages: [...mine.pages, ...newPages].sort((x, y) => x - y),
          values: { ...mine.values, ...pick(r.values) },
          flags: { ...mine.flags, ...pick(r.flags) },
          crops: { ...mine.crops, ...pick(r.crops) },
        };
      }
      continue;
    }
    if (!clashes.some((c) => c.serial === r.serial && stableStringify(c.response) === stableStringify(r))) {
      clashes.push({ serial: r.serial, response: r, source, at: now });
      report.clashes.push(r.serial);
    }
  }
  responses.sort((x, y) => x.serial - y.serial);
  const reservations = [...(a.reservations ?? [])];
  for (const r of b.reservations ?? []) if (!reservations.some((x) => x.id === r.id)) reservations.push(r);
  const log = [...(a.log ?? [])];
  for (const c of b.log ?? []) if (!log.some((x) => x.at === c.at && x.serial === c.serial && x.var === c.var)) log.push(c);
  return {
    project: {
      ...a, versions, batches, responses, clashes, deleted, reservations, log,
      nextSerial: Math.max(a.nextSerial, b.nextSerial),
      updatedAt: now,
    },
    report,
  };
}

/** Settle two sheets that share a serial: keep ours, take theirs, or keep both (theirs gets a new ID). */
export function resolveClash(p: Project, index: number, action: 'mine' | 'theirs' | 'both'): Project {
  const clashes = [...(p.clashes ?? [])];
  const [c] = clashes.splice(index, 1);
  if (!c) return p;
  let responses = p.responses;
  let nextSerial = p.nextSerial;
  if (action === 'theirs') responses = [...responses.filter((r) => r.serial !== c.serial), c.response].sort((x, y) => x.serial - y.serial);
  if (action === 'both') {
    const serial = nextFreeSerial(p);
    nextSerial = serial + 1;
    responses = [...responses, { ...c.response, serial, originalSerial: c.serial }];
  }
  return { ...p, clashes, responses, nextSerial };
}

export function deleteResponses(p: Project, serials: number[]): Project {
  const at = new Date().toISOString();
  return {
    ...p,
    responses: p.responses.filter((r) => !serials.includes(r.serial)),
    deleted: [...(p.deleted ?? []).filter((d) => !serials.includes(d.serial)), ...serials.map((serial) => ({ serial, at }))],
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

export type PageResult = {
  serial: number;
  fp: string;
  page: number;
  fields: Record<string, { value: number | string | null; flag?: Flag }>;
  crops: Record<string, string>;
};

/** Put one scanned page into its participant's row. Pages can arrive in any order. */
export function applyPage(p: Project, pr: PageResult, replace: boolean): { project: Project; status: 'added' | 'replaced' | 'duplicate' | 'conflict' } {
  const responses = [...p.responses];
  const i = responses.findIndex((r) => r.serial === pr.serial);
  const now = new Date().toISOString();
  const strip = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => !(k in pr.fields)));
  const values = Object.fromEntries(Object.entries(pr.fields).map(([k, v]) => [k, v.value]));
  const flags = Object.fromEntries(Object.entries(pr.fields).flatMap(([k, v]) => (v.flag ? [[k, v.flag]] : []))) as Record<string, Flag>;
  let status: 'added' | 'replaced' = 'added';
  const deleted = (p.deleted ?? []).filter((d) => d.serial !== pr.serial);
  if (i < 0) {
    responses.push({ serial: pr.serial, fp: pr.fp, pages: [pr.page], values, flags, crops: pr.crops, scannedAt: now });
  } else {
    const r = responses[i];
    if (r.fp !== pr.fp) return { project: p, status: 'conflict' };
    if (r.pages.includes(pr.page)) {
      if (!replace) return { project: p, status: 'duplicate' };
      status = 'replaced';
    }
    responses[i] = {
      ...r,
      pages: [...new Set([...r.pages, pr.page])].sort((a, b) => a - b),
      values: { ...strip(r.values), ...values },
      flags: { ...strip(r.flags), ...flags },
      crops: { ...strip(r.crops), ...pr.crops },
      scannedAt: now,
    };
  }
  responses.sort((a, b) => a.serial - b.serial);
  return { project: { ...p, responses, deleted, updatedAt: now }, status };
}

export function setAnswers(p: Project, serial: number, changes: Record<string, number | string | null>): Project {
  const at = new Date().toISOString();
  const r0 = p.responses.find((r) => r.serial === serial);
  if (!r0) return p;
  const log = [...(p.log ?? [])];
  for (const [v, to] of Object.entries(changes)) log.push({ at, serial, var: v, from: r0.values[v] ?? null, to, flag: r0.flags[v] });
  return {
    ...p,
    updatedAt: at,
    log,
    responses: p.responses.map((r) => {
      if (r.serial !== serial) return r;
      const flags = { ...r.flags };
      const crops = { ...r.crops };
      for (const [v, value] of Object.entries(changes)) {
        delete flags[v];
        if (typeof value !== 'string') delete crops[v];
      }
      return { ...r, values: { ...r.values, ...changes }, flags, crops };
    }),
  };
}

export const setAnswer = (p: Project, serial: number, v: string, value: number | string | null) => setAnswers(p, serial, { [v]: value });
