import { useMemo } from 'react';
import type { Update } from '../App';
import { SCALE_PRESETS, blockVars, newBlock, uid, validateForm, type Block, type BlockKind, type LikertItem, type Project, type ScaleOption } from '../lib/schema';
import { Preview } from './Preview';
import { Glyph } from './glyphs';
import { PageHead } from './art';

const KINDS: [BlockKind, string, string][] = [
  ['likert', 'Rating scale', 'Statements down the side, scale across the top. Likert, frequency, GAD-7 style.'],
  ['single', 'Single choice', 'One bubble per option, pick one. Gender, year of study.'],
  ['multi', 'Tick all that apply', 'Square boxes. Each option becomes its own 0/1 column.'],
  ['number', 'Number', 'Write-in boxes plus 0–9 bubbles per digit. Age, participant code.'],
  ['open', 'Open answer', 'Lined box. You read the handwriting later and type it in.'],
  ['heading', 'Heading', 'Starts a new section, with a rule underneath.'],
  ['text', 'Instructions', 'Consent text, directions, a thank-you.'],
  ['pagebreak', 'Page break', 'Forces whatever comes next onto a new page.'],
];

function varRange(b: Block): string {
  const v = blockVars(b);
  if (!v.length) return '';
  return v.length === 1 ? v[0] : `${v[0]} … ${v[v.length - 1]}`;
}
const NAME = Object.fromEntries(KINDS.map(([k, n]) => [k, n])) as Record<BlockKind, string>;

export function Builder({ project, update, onNext }: { project: Project; update: Update; onNext: () => void }) {
  const form = project.form;
  const errors = useMemo(() => validateForm(form), [form]);
  const printed = project.batches.length > 0;

  const setForm = (patch: Partial<typeof form>) => update((p) => ({ ...p, form: { ...p.form, ...patch } }));
  const setBlock = (i: number, b: Block) => setForm({ blocks: form.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, d: number) => {
    const blocks = [...form.blocks];
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setForm({ blocks });
  };
  const remove = (i: number) => {
    if (blockVars(form.blocks[i]).length && !confirm('Delete this block?')) return;
    setForm({ blocks: form.blocks.filter((_, j) => j !== i) });
  };
  const duplicate = (i: number) => {
    const copy = structuredClone(form.blocks[i]);
    copy.id = uid(6);
    const suffix = (v: string) => `${v}_copy`;
    if ('varName' in copy) copy.varName = suffix(copy.varName);
    if (copy.kind === 'likert') copy.items = copy.items.map((it) => ({ ...it, id: uid(6), varName: suffix(it.varName) }));
    setForm({ blocks: [...form.blocks.slice(0, i + 1), copy, ...form.blocks.slice(i + 1)] });
  };
  const add = (kind: BlockKind) => {
    const n = form.blocks.filter((b) => blockVars(b).length).length + 1;
    let b = newBlock(kind, n);
    const taken = new Set(form.blocks.flatMap(blockVars));
    if ('varName' in b) { let k = n; while (taken.has(`q${k}`)) k++; b = { ...b, varName: `q${k}` }; }
    setForm({ blocks: [...form.blocks, b] });
    setTimeout(() => document.getElementById(`b-${b.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="stack-lg">
    <PageHead step={1} title={<>Build your <em>questionnaire</em></>}
      lead="Add questions in the order they should appear on paper. Each one becomes a column in your spreadsheet. The preview shows the real printed pages." />
    <div className="split">
      <div className="stack">
        <div className="sheet titlecard stack">
          <input className="big" value={form.title} placeholder="Name your questionnaire" aria-label="Questionnaire title" onChange={(e) => setForm({ title: e.target.value })} />
          <label>Line under the title (optional)<input value={form.subtitle} placeholder="e.g. Department of Psychology · Stress & sleep study, 2026" onChange={(e) => setForm({ subtitle: e.target.value })} /></label>
          {printed && <div className="note info">You've printed copies already. Editing is fine: the next batch gets a new layout version, and sheets from every version still scan into the same spreadsheet.</div>}
        </div>

        {form.blocks.length === 0 && (
          <div className="empty">
            <h3>Blank page</h3>
            <p style={{ margin: 0 }}>Most studies start with a consent paragraph, a few demographic questions, then one rating scale per measure. Pick blocks below in the order they should appear on paper.</p>
          </div>
        )}

        {form.blocks.map((b, i) => (
          <div className={`block k-${b.kind} ${b.kind === 'pagebreak' ? 'pagebreak' : ''}`} key={b.id} id={`b-${b.id}`}>
            <div className="block-head">
              <Glyph kind={b.kind} />
              <span className="kind">{NAME[b.kind]}</span>
              <span className="vars">{varRange(b)}</span>
              <span className="grow" />
              <span className="tools">
                <button className="ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                <button className="ghost small" onClick={() => move(i, 1)} disabled={i === form.blocks.length - 1} aria-label="Move down" title="Move down">↓</button>
                <button className="ghost small" onClick={() => duplicate(i)}>Copy</button>
                <button className="ghost small danger" onClick={() => remove(i)}>Delete</button>
              </span>
            </div>
            {b.kind !== 'pagebreak' && <div className="block-body"><BlockEditor block={b} onChange={(nb) => setBlock(i, nb)} /></div>}
          </div>
        ))}

        <div>
          <div className="section-head"><h3 style={{ margin: 0 }}>Add to the questionnaire</h3><small className="mono">goes at the end · reorder with ↑ ↓</small></div>
          <div className="palette">
            {KINDS.map(([k, n, hint]) => (
              <button key={k} className={`tile k-${k}`} onClick={() => add(k)}>
                <Glyph kind={k} />
                <b>{n}</b>
                <small>{hint}</small>
              </button>
            ))}
          </div>
        </div>

        {errors.length > 0 && form.blocks.length > 0 && (
          <div className="note warn"><b>Fix before printing:</b><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
        )}
        <div className="row end"><button className="primary" onClick={onNext}>Print copies →</button></div>
      </div>
      <div className="sticky"><Preview form={form} /></div>
    </div>
    </div>
  );
}

function BlockEditor({ block: b, onChange }: { block: Block; onChange: (b: Block) => void }) {
  switch (b.kind) {
    case 'heading':
      return <label>Heading<input value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} /></label>;
    case 'text':
      return <label>Text<textarea rows={3} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} /></label>;
    case 'likert':
      return <LikertEditor b={b} onChange={onChange} />;
    case 'single':
      return (
        <div className="stack">
          <QuestionHead text={b.text} varName={b.varName} onChange={(text, varName) => onChange({ ...b, text, varName })} />
          <OptionsEditor options={b.options} onChange={(options) => onChange({ ...b, options })} />
        </div>
      );
    case 'multi':
      return (
        <div className="stack">
          <QuestionHead text={b.text} varName={b.varName} onChange={(text, varName) => onChange({ ...b, text, varName })} />
          <div className="stack">
            {b.options.map((o, i) => (
              <div className="opt-row" key={i}>
                <span className="dotmark sq" />
                <input value={o} aria-label={`Option ${i + 1}`} onChange={(e) => onChange({ ...b, options: b.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                <span className="tag">{b.varName}_{i + 1}</span>
                <button className="x" onClick={() => onChange({ ...b, options: b.options.filter((_, j) => j !== i) })} aria-label="Remove option">×</button>
              </div>
            ))}
            <div><button className="small" onClick={() => onChange({ ...b, options: [...b.options, `Option ${b.options.length + 1}`] })}>+ Option</button></div>
            <small>Each option gets its own column: 1 = ticked, 0 = left empty.</small>
          </div>
        </div>
      );
    case 'number':
      return (
        <div className="stack">
          <QuestionHead text={b.text} varName={b.varName} onChange={(text, varName) => onChange({ ...b, text, varName })} />
          <label style={{ maxWidth: 200 }}>Number of digits
            <input type="number" min={1} max={8} value={b.digits} onChange={(e) => onChange({ ...b, digits: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} />
          </label>
        </div>
      );
    case 'open':
      return (
        <div className="stack">
          <QuestionHead text={b.text} varName={b.varName} onChange={(text, varName) => onChange({ ...b, text, varName })} />
          <label style={{ maxWidth: 200 }}>Lines
            <input type="number" min={1} max={20} value={b.lines} onChange={(e) => onChange({ ...b, lines: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
          </label>
          <small>Handwriting isn't read automatically. After scanning you'll see a picture of each answer and can type it in.</small>
        </div>
      );
    default:
      return null;
  }
}

function QuestionHead({ text, varName, onChange }: { text: string; varName: string; onChange: (text: string, varName: string) => void }) {
  return (
    <div className="row qhead" style={{ alignItems: 'flex-end' }}>
      <label className="grow">Question<input value={text} onChange={(e) => onChange(e.target.value, varName)} /></label>
      <label style={{ width: 150 }}>Column name<input className="var" value={varName} onChange={(e) => onChange(text, e.target.value.replace(/\s/g, '_'))} /></label>
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: ScaleOption[]; onChange: (o: ScaleOption[]) => void }) {
  const set = (i: number, patch: Partial<ScaleOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="stack">
      <div className="opt-row colhead"><span /><span>Option on paper</span><span>Stored as</span><span /></div>
      {options.map((o, i) => (
        <div className="opt-row" key={i}>
          <span className="dotmark" />
          <input value={o.label} aria-label={`Option ${i + 1} label`} onChange={(e) => set(i, { label: e.target.value })} />
          <input className="val" type="number" value={o.value} aria-label={`Option ${i + 1} value`} onChange={(e) => set(i, { value: Number(e.target.value) })} />
          <button className="x" onClick={() => onChange(options.filter((_, j) => j !== i))} aria-label="Remove option">×</button>
        </div>
      ))}
      <div className="row">
        <button className="small" onClick={() => onChange([...options, { label: `Option ${options.length + 1}`, value: Math.max(0, ...options.map((o) => o.value)) + 1 }])}>+ Option</button>
        <PresetPicker onPick={onChange} />
      </div>
    </div>
  );
}

function PresetPicker({ onPick }: { onPick: (o: ScaleOption[]) => void }) {
  return (
    <select style={{ width: 'auto' }} value="" onChange={(e) => { const p = SCALE_PRESETS[Number(e.target.value)]; if (p) onPick(p.options.map((o) => ({ ...o }))); }}>
      <option value="">Use a preset scale…</option>
      {SCALE_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}: {p.options.map((o) => o.label).join(' / ')}</option>)}
    </select>
  );
}

function LikertEditor({ b, onChange }: { b: Extract<Block, { kind: 'likert' }>; onChange: (b: Block) => void }) {
  const setItem = (i: number, patch: Partial<LikertItem>) => onChange({ ...b, items: b.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const prefix = (b.items[0]?.varName.match(/^(.*?)(\d+)$/)?.[1]) || 'item';
  const nextVar = (k: number) => `${prefix}${k}`;
  const paste = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return;
    const start = b.items.length;
    onChange({ ...b, items: [...b.items, ...lines.map((t, i) => ({ id: uid(6), varName: nextVar(start + i + 1), text: t, subscale: b.items[0]?.subscale }))] });
  };
  const renumber = () => {
    const p = prompt('Variable name prefix (items will be named prefix1, prefix2, …)', prefix);
    if (!p) return;
    onChange({ ...b, items: b.items.map((it, i) => ({ ...it, varName: `${p.replace(/\W/g, '_')}${i + 1}` })) });
  };
  return (
    <div className="stack">
      <label>Instruction above the scale<input value={b.title} onChange={(e) => onChange({ ...b, title: e.target.value })} /></label>
      <details>
        <summary style={{ listStyle: 'none' }}>
          <div className="row"><span className="scalebar">{b.options.map((o) => <span key={o.value}><b>{o.value}</b>{o.label}</span>)}</span><span className="link" style={{ color: 'var(--red-ink)', fontSize: '.82rem' }}>edit scale</span></div>
        </summary>
        <div style={{ marginTop: '.5rem' }}><OptionsEditor options={b.options} onChange={(options) => onChange({ ...b, options })} /></div>
      </details>
      <div className="item-row colhead colheads"><span /><span>Statement</span><span>Column</span><span>Subscale</span><span title="Reverse-scored">Rev.</span><span /></div>
      {b.items.map((it, i) => (
        <div className="item-row" key={it.id}>
          <span className="num">{i + 1}.</span>
          <input value={it.text} aria-label={`Statement ${i + 1}`} onChange={(e) => setItem(i, { text: e.target.value })} />
          <input className="var" value={it.varName} aria-label="Variable name" onChange={(e) => setItem(i, { varName: e.target.value.replace(/\s/g, '_') })} />
          <input className="sub" value={it.subscale ?? ''} placeholder="—" aria-label="Subscale" onChange={(e) => setItem(i, { subscale: e.target.value.replace(/\s/g, '_') })} />
          <label className="rev" title="Reverse-scored. Only subscale scores flip it; the raw answer stays as marked.">
            <input type="checkbox" checked={!!it.reverse} onChange={(e) => setItem(i, { reverse: e.target.checked })} />R
          </label>
          <button className="x" aria-label="Remove statement" onClick={() => onChange({ ...b, items: b.items.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <div className="row">
        <button className="small" onClick={() => onChange({ ...b, items: [...b.items, { id: uid(6), varName: nextVar(b.items.length + 1), text: '', subscale: b.items[0]?.subscale }] })}>+ Statement</button>
        <button className="small ghost" onClick={renumber}>Rename columns…</button>
      </div>
      <details>
        <summary>Paste a whole scale at once (one statement per line)</summary>
        <PasteBox onAdd={paste} />
      </details>
    </div>
  );
}

function PasteBox({ onAdd }: { onAdd: (text: string) => void }) {
  return (
    <form className="stack" style={{ marginTop: '.5rem' }} onSubmit={(e) => {
      e.preventDefault();
      const ta = e.currentTarget.elements.namedItem('t') as HTMLTextAreaElement;
      onAdd(ta.value);
      ta.value = '';
    }}>
      <textarea name="t" rows={5} placeholder={'One statement per line, e.g.\n1. I feel calm.\n2. I worry a lot.'} />
      <div><button className="small" type="submit">Add statements</button></div>
    </form>
  );
}
