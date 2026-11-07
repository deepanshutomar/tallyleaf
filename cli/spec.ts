import YAML from 'yaml';
import { SCALE_PRESETS, uid, validateForm, type Block, type FormDef, type LikertItem, type ScaleOption } from '../src/lib/schema';

/**
 * The questionnaire file (YAML or JSON) that people and AI agents write by hand.
 * It maps 1:1 onto the website's questionnaire blocks.
 */

export const PRESETS: Record<string, string> = {
  'agree-5': 'Agreement (5)',
  'agree-4': 'Agreement (4)',
  'agree-7': 'Agreement (7)',
  'frequency-5': 'Frequency (5)',
  'frequency-0-3': 'Frequency 0–3',
  'intensity-5': 'Intensity (5)',
  'truefalse-4': 'True/False (4)',
  'yes-no': 'Yes / No',
};

const presetOptions = (key: string): ScaleOption[] | null => {
  const name = PRESETS[key.trim().toLowerCase()];
  const p = SCALE_PRESETS.find((x) => x.name === name);
  return p ? p.options.map((o) => ({ ...o })) : null;
};

type Raw = Record<string, unknown>;

class SpecError extends Error {}

function parseOptions(raw: unknown, start: unknown, where: string): ScaleOption[] {
  const first = typeof start === 'number' ? start : 1;
  if (typeof raw === 'string') {
    const p = presetOptions(raw);
    if (!p) throw new SpecError(`${where}: unknown preset "${raw}". Use one of: ${Object.keys(PRESETS).join(', ')}, or list the options.`);
    return p;
  }
  if (Array.isArray(raw)) {
    return raw.map((o, i) => {
      if (typeof o === 'string') {
        const m = o.match(/^\s*(-?\d+)\s*=\s*(.+)$/);
        return m ? { value: Number(m[1]), label: m[2].trim() } : { value: first + i, label: o };
      }
      if (typeof o === 'number') return { value: first + i, label: String(o) };
      if (o && typeof o === 'object') {
        const r = o as Raw;
        if ('label' in r) return { value: typeof r.value === 'number' ? r.value : first + i, label: String(r.label) };
        const [k, v] = Object.entries(r)[0] ?? [];
        if (k !== undefined && /^-?\d+$/.test(k)) return { value: Number(k), label: String(v) };
      }
      throw new SpecError(`${where}: option ${i + 1} should be text, "2 = Label", or {value, label}.`);
    });
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Raw).map(([k, v]) => {
      if (!/^-?\d+$/.test(k)) throw new SpecError(`${where}: option keys must be numbers (e.g. 1: Woman), got "${k}".`);
      return { value: Number(k), label: String(v) };
    });
  }
  throw new SpecError(`${where}: "options" is missing.`);
}

function parseItems(raw: unknown, sub: string | undefined, where: string): LikertItem[] {
  if (!Array.isArray(raw) || !raw.length) throw new SpecError(`${where}: "items" must be a list of statements.`);
  return raw.map((it, i) => {
    const w = `${where} item ${i + 1}`;
    if (it && typeof it === 'object') {
      const r = it as Raw;
      if ('text' in r || 'name' in r) {
        if (!r.name || !r.text) throw new SpecError(`${w}: needs both "name" (column) and "text".`);
        return { id: uid(6), varName: String(r.name), text: String(r.text), reverse: !!r.reverse, subscale: (r.subscale as string) ?? sub };
      }
      const [k, v] = Object.entries(r)[0] ?? [];
      if (k && typeof v === 'string') return { id: uid(6), varName: k, text: v, subscale: sub };
    }
    throw new SpecError(`${w}: write it as "colname: Statement text" or {name, text, reverse, subscale}.`);
  });
}

function parseBlock(raw: unknown, i: number): Block {
  const where = `block ${i + 1}`;
  if (raw === 'pagebreak' || (raw && typeof raw === 'object' && 'pagebreak' in (raw as Raw))) return { kind: 'pagebreak', id: uid(6) };
  if (!raw || typeof raw !== 'object') throw new SpecError(`${where}: expected a block like "heading: …", "scale: …", "single: colname" …`);
  const r = raw as Raw;
  const str = (k: string) => (r[k] === undefined || r[k] === null ? '' : String(r[k]));
  const id = uid(6);
  if ('heading' in r) return { kind: 'heading', id, text: str('heading') };
  if ('text' in r && Object.keys(r).length === 1) return { kind: 'text', id, text: str('text') };
  if ('instructions' in r) return { kind: 'text', id, text: str('instructions') };
  if ('scale' in r) {
    const s = (r.scale ?? {}) as Raw;
    const w = `${where} (scale${s.title ? ` "${String(s.title).slice(0, 30)}"` : ''})`;
    return {
      kind: 'likert', id, title: String(s.title ?? ''),
      options: parseOptions(s.options, s.start, w),
      items: parseItems(s.items, s.subscale ? String(s.subscale) : undefined, w),
    };
  }
  const name = (k: string) => {
    const v = r[k];
    if (typeof v !== 'string' || !v.trim()) throw new SpecError(`${where}: "${k}:" must be followed by the column name, e.g. "${k}: q1".`);
    return v.trim();
  };
  const question = (w: string) => {
    if (!r.question) throw new SpecError(`${w}: "question" is missing.`);
    return String(r.question);
  };
  if ('single' in r) {
    const v = name('single');
    return { kind: 'single', id, varName: v, text: question(`${where} (${v})`), options: parseOptions(r.options, r.start, `${where} (${v})`) };
  }
  if ('multi' in r) {
    const v = name('multi');
    if (!Array.isArray(r.options)) throw new SpecError(`${where} (${v}): "options" must be a list of labels.`);
    return { kind: 'multi', id, varName: v, text: question(`${where} (${v})`), options: r.options.map(String) };
  }
  if ('number' in r) {
    const v = name('number');
    return { kind: 'number', id, varName: v, text: question(`${where} (${v})`), digits: Number(r.digits ?? 2), keepZeros: !!(r.keep_zeros ?? r.keepZeros) };
  }
  if ('open' in r) {
    const v = name('open');
    return { kind: 'open', id, varName: v, text: question(`${where} (${v})`), lines: Number(r.lines ?? 3) };
  }
  throw new SpecError(`${where}: unknown block. Use one of: heading, text, scale, single, multi, number, open, pagebreak.`);
}

/** Parse a questionnaire file (YAML or JSON). Throws with every problem listed. */
export function parseQuestionnaire(source: string): FormDef {
  let data: unknown;
  try {
    data = YAML.parse(source);
  } catch (e) {
    throw new Error(`The questionnaire file isn't valid YAML/JSON: ${(e as Error).message}`);
  }
  if (!data || typeof data !== 'object') throw new Error('The questionnaire file is empty.');
  const d = data as Raw;
  if (!Array.isArray(d.blocks)) throw new Error('The questionnaire needs a "blocks:" list.');
  const problems: string[] = [];
  const blocks: Block[] = [];
  d.blocks.forEach((b, i) => {
    try { blocks.push(parseBlock(b, i)); } catch (e) { problems.push((e as Error).message); }
  });
  const form: FormDef = { title: String(d.title ?? 'Questionnaire'), subtitle: String(d.subtitle ?? ''), blocks };
  if (!problems.length) problems.push(...validateForm(form));
  if (problems.length) throw new Error(`The questionnaire has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  return form;
}

const optsOut = (options: ScaleOption[]) => {
  for (const [key, name] of Object.entries(PRESETS)) {
    const p = SCALE_PRESETS.find((x) => x.name === name)!;
    if (p.options.length === options.length && p.options.every((o, i) => o.value === options[i].value && o.label === options[i].label)) return key;
  }
  return options.map((o) => `${o.value} = ${o.label}`);
};

/** The reverse: a project's questionnaire as an editable file. */
export function questionnaireToYaml(form: FormDef): string {
  const blocks = form.blocks.map((b): unknown => {
    switch (b.kind) {
      case 'heading': return { heading: b.text };
      case 'text': return { text: b.text };
      case 'pagebreak': return 'pagebreak';
      case 'likert': {
        const subs = new Set(b.items.map((i) => i.subscale ?? ''));
        const shared = subs.size === 1 ? [...subs][0] : '';
        return {
          scale: {
            title: b.title,
            options: optsOut(b.options),
            ...(shared ? { subscale: shared } : {}),
            items: b.items.map((i) => (i.reverse || (i.subscale && !shared)
              ? { name: i.varName, text: i.text, ...(i.reverse ? { reverse: true } : {}), ...(i.subscale && !shared ? { subscale: i.subscale } : {}) }
              : { [i.varName]: i.text })),
          },
        };
      }
      case 'single': return { single: b.varName, question: b.text, options: optsOut(b.options) };
      case 'multi': return { multi: b.varName, question: b.text, options: b.options };
      case 'number': return { number: b.varName, question: b.text, digits: b.digits, ...(b.keepZeros ? { keep_zeros: true } : {}) };
      case 'open': return { open: b.varName, question: b.text, lines: b.lines };
    }
  });
  return YAML.stringify({ title: form.title, subtitle: form.subtitle, blocks }, { lineWidth: 0 });
}

export const QUESTIONNAIRE_HELP = `# Tallyleaf questionnaire file (YAML; JSON works too)
# Blocks appear on paper in this order. Column names: start with a letter, then letters/digits/_ only.
#
#   - heading: Section title
#   - text: Instructions or consent paragraph
#   - single: colname          # pick one;  options: preset | list | {1: Label, 9: Other}
#     question: Gender
#     options: [Woman, Man]      # stored as 1, 2 (use "start: 0" to begin at 0, or "2 = Man")
#   - multi: colname            # tick all that apply → colname_1, colname_2 … (1 = ticked)
#     question: What do you do to relax?
#     options: [Exercise, Music]
#   - number: age               # digit bubbles; keep_zeros: true for codes like 007
#     question: Age (in years)
#     digits: 2
#   - open: comments            # lined box; read later from the photo
#     question: Anything else?
#     lines: 3
#   - scale:                    # rating grid (Likert)
#       title: How much do you agree?
#       options: agree-5        # presets: ${Object.keys(PRESETS).join(', ')}
#       subscale: selfesteem    # optional: adds _sum, _mean, _n scores
#       items:
#         - se1: I feel good about myself.
#         - { name: se2, text: I feel useless at times., reverse: true }
#   - pagebreak
`;
