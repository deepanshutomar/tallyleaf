export const FILE_FORMAT = 'tallyleaf';
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.1.0';

export type ScaleOption = { label: string; value: number };

export type LikertItem = {
  id: string;
  varName: string;
  text: string;
  reverse?: boolean;
  subscale?: string;
};

export type Block =
  | { kind: 'heading'; id: string; text: string }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'likert'; id: string; title: string; options: ScaleOption[]; items: LikertItem[] }
  | { kind: 'single'; id: string; varName: string; text: string; options: ScaleOption[] }
  | { kind: 'multi'; id: string; varName: string; text: string; options: string[] }
  | { kind: 'number'; id: string; varName: string; text: string; digits: number; keepZeros?: boolean }
  | { kind: 'open'; id: string; varName: string; text: string; lines: number }
  | { kind: 'pagebreak'; id: string };

export type BlockKind = Block['kind'];

export type FormDef = { title: string; subtitle: string; blocks: Block[] };

export type FieldType = 'choice' | 'check' | 'digits' | 'text';

/** A printed answer target, in mm from the page's top-left corner. */
export type Mark = { x: number; y: number; value: number; shape: 'circle' | 'square'; pos?: number };

export type Rect = { x: number; y: number; w: number; h: number };

export type Field = {
  var: string;
  type: FieldType;
  label: string;
  page: number;
  marks: Mark[];
  region: Rect;
  valueLabels?: ScaleOption[];
  digits?: number;
  reverse?: boolean;
  subscale?: string;
  min?: number;
  max?: number;
  group?: string;
  /** Digits kept as text, so leading zeros survive (IDs, codes). */
  asText?: boolean;
};

export type Geometry = {
  pageW: number;
  pageH: number;
  markerSize: number;
  markers: [number, number][];
  qr: Rect;
  markR: number;
};

export type Version = {
  fp: string;
  createdAt: string;
  pages: number;
  form: FormDef;
  geometry: Geometry;
  fields: Field[];
};

export type Batch = { id: string; fp: string; from: number; to: number; createdAt: string; by?: string };

/** A block of serials claimed by one teammate, so two people never print the same IDs. */
export type Reservation = { id: string; name: string; from: number; to: number };

/** Two different sheets that carry the same serial (found when merging teammates' files). */
export type Clash = { serial: number; response: Response; source: string; at: string };

/** Every manual change in the Data step, for supervisors and audits. */
export type Correction = { at: string; serial: number; var: string; from: number | string | null; to: number | string | null; flag?: Flag };

export type Flag = 'blank' | 'faint' | 'multiple' | 'unclear' | 'missing-page' | 'text' | 'text-empty' | 'group-empty';

export type Response = {
  serial: number;
  fp: string;
  pages: number[];
  values: Record<string, number | string | null>;
  flags: Record<string, Flag>;
  crops: Record<string, string>;
  scannedAt: string;
  /** Set when this row was given a new ID because another sheet had the same serial. */
  originalSerial?: number;
};

export type Project = {
  format: typeof FILE_FORMAT;
  schemaVersion: number;
  appVersion: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  lastFileSaveAt?: string;
  form: FormDef;
  versions: Version[];
  batches: Batch[];
  nextSerial: number;
  responses: Response[];
  reservations?: Reservation[];
  /** Serials deleted on purpose, so merging an older file doesn't bring them back. */
  deleted?: { serial: number; at: string }[];
  clashes?: Clash[];
  log?: Correction[];
};

export function uid(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export const SCALE_PRESETS: { name: string; options: ScaleOption[] }[] = [
  { name: 'Agreement (5)', options: opts(['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'], 1) },
  { name: 'Agreement (4)', options: opts(['Strongly disagree', 'Disagree', 'Agree', 'Strongly agree'], 1) },
  { name: 'Agreement (7)', options: opts(['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neutral', 'Somewhat agree', 'Agree', 'Strongly agree'], 1) },
  { name: 'Frequency (5)', options: opts(['Never', 'Rarely', 'Sometimes', 'Often', 'Always'], 1) },
  { name: 'Frequency 0–3', options: opts(['Not at all', 'Several days', 'More than half the days', 'Nearly every day'], 0) },
  { name: 'Intensity (5)', options: opts(['Not at all', 'A little', 'Moderately', 'Quite a bit', 'Extremely'], 1) },
  { name: 'True/False (4)', options: opts(['Definitely false', 'Mostly false', 'Mostly true', 'Definitely true'], 1) },
  { name: 'Yes / No', options: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }] },
];

function opts(labels: string[], start: number): ScaleOption[] {
  return labels.map((label, i) => ({ label, value: start + i }));
}

export function newBlock(kind: BlockKind, n: number): Block {
  const id = uid(6);
  switch (kind) {
    case 'heading':
      return { kind, id, text: 'Section title' };
    case 'text':
      return { kind, id, text: 'Instructions for this section.' };
    case 'likert':
      return {
        kind, id, title: 'Please indicate how much you agree with each statement.',
        options: SCALE_PRESETS[0].options.map((o) => ({ ...o })),
        items: [1, 2, 3].map((i) => ({ id: uid(6), varName: `s${n}_${i}`, text: `Statement ${i}` })),
      };
    case 'single':
      return { kind, id, varName: `q${n}`, text: 'Question text', options: opts(['Option A', 'Option B', 'Option C'], 1) };
    case 'multi':
      return { kind, id, varName: `q${n}`, text: 'Question text (tick all that apply)', options: ['Option A', 'Option B', 'Option C'] };
    case 'number':
      return { kind, id, varName: `q${n}`, text: 'Age (in years)', digits: 2 };
    case 'open':
      return { kind, id, varName: `q${n}`, text: 'Your answer', lines: 3 };
    case 'pagebreak':
      return { kind, id };
  }
}

export function newProject(title = 'Untitled questionnaire'): Project {
  const now = new Date().toISOString();
  return {
    format: FILE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    id: uid(8),
    createdAt: now,
    updatedAt: now,
    form: { title, subtitle: '', blocks: [] },
    versions: [],
    batches: [],
    nextSerial: 1,
    responses: [],
  };
}

const VAR_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Variable names each block produces, in print order. */
export function blockVars(b: Block): string[] {
  switch (b.kind) {
    case 'likert':
      return b.items.map((i) => i.varName);
    case 'multi':
      return b.options.map((_, i) => `${b.varName}_${i + 1}`);
    case 'single':
    case 'number':
    case 'open':
      return [b.varName];
    default:
      return [];
  }
}

const SPSS_RESERVED = new Set(['all', 'and', 'by', 'eq', 'ge', 'gt', 'le', 'lt', 'ne', 'not', 'or', 'to', 'with']);
export const SYSTEM_COLUMNS = ['serial', 'version', 'pages_missing', 'unresolved_flags'];

function nameProblem(v: string, what: string, maxLen = 64): string | null {
  if (!VAR_RE.test(v)) return `${what} "${v}" can't be used: start with a letter, then only letters, digits and _ (no spaces or hyphens).`;
  if (v.length > maxLen) return `${what} "${v}" is too long (max ${maxLen} characters).`;
  if (SPSS_RESERVED.has(v.toLowerCase())) return `${what} "${v}" is a reserved word in SPSS. Try "${v}_1".`;
  return null;
}

export function validateForm(form: FormDef): string[] {
  const errors: string[] = [];
  const seen = new Set<string>(SYSTEM_COLUMNS);
  const subscales = new Set<string>();
  for (const b of form.blocks) {
    for (const v of blockVars(b)) {
      const bad = nameProblem(v, 'Column name');
      if (bad) errors.push(bad);
      else if (SYSTEM_COLUMNS.includes(v.toLowerCase())) errors.push(`Column name "${v}" is used by Tallyleaf itself. Pick another name.`);
      else if (seen.has(v.toLowerCase())) errors.push(`Column name "${v}" is used more than once.`);
      seen.add(v.toLowerCase());
    }
    if (b.kind === 'likert') for (const it of b.items) if (it.subscale?.trim()) subscales.add(it.subscale.trim());
    if ((b.kind === 'likert' || b.kind === 'single' || b.kind === 'multi') && b.options.length < 2)
      errors.push(`A question needs at least 2 options (${b.kind === 'likert' ? b.title : b.text}).`);
    if (b.kind === 'likert' && b.items.length === 0) errors.push(`Scale "${b.title}" has no statements.`);
    if ((b.kind === 'likert' || b.kind === 'single') && b.options.length > 10)
      errors.push('Use at most 10 options per question.');
    if ((b.kind === 'likert' || b.kind === 'single') && new Set(b.options.map((o) => o.value)).size !== b.options.length)
      errors.push(`"${b.kind === 'likert' ? b.title : b.text}" has two options stored as the same number.`);
  }
  for (const sub of subscales) {
    const bad = nameProblem(sub, 'Subscale name', 59);
    if (bad) errors.push(bad);
    for (const suffix of ['_sum', '_mean', '_n']) if (seen.has(`${sub}${suffix}`.toLowerCase())) errors.push(`Column "${sub}${suffix}" clashes with the score Tallyleaf adds for subscale "${sub}".`);
  }
  if (!form.blocks.some((b) => blockVars(b).length > 0)) errors.push('Add at least one question.');
  return errors;
}
