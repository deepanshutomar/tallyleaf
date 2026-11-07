import { useMemo, useRef, useState } from 'react';
import type { Update } from '../App';
import { download, slug } from '../lib/browser';
import { codebookTable, correctionsTable, dataTable, spssSyntax, toCsv, toXlsx } from '../lib/export';
import { allFields, deleteResponses, mergeProjects, missingPages, printedCount, resolveClash, setAnswers } from '../lib/project';
import { formatSerial } from '../lib/qr';
import type { Field, Flag, Project, Response } from '../lib/schema';
import { readProjectFile } from './Home';
import { Icon, PageHead } from './art';
import { confirmDialog } from './dialog';

const FLAG_TEXT: Record<Flag, string> = {
  blank: 'Nothing was marked. Was it skipped? Confirm Missing, or pick the answer.',
  faint: 'Only a very light mark. Was it meant as an answer?',
  multiple: 'Two or more options are marked. Pick the one they meant, or Missing.',
  unclear: 'The marks are hard to tell apart. Pick the intended answer.',
  'missing-page': 'Page not scanned yet.',
  text: 'Type what the participant wrote.',
  'text-empty': 'This box looks empty. Confirm, or type what is written.',
  'group-empty': 'Nothing is ticked in this question. Did they skip it, or does none of it apply?',
};
const SOFT = new Set<Flag>(['blank', 'text-empty', 'group-empty']);

type Sel = { serial: number; v: string };

export function DataView({ project, update }: { project: Project; update: Update }) {
  const fields = useMemo(() => allFields(project), [project]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');
  const mergeRef = useRef<HTMLInputElement>(null);
  const responses = project.responses;
  const allFlags = responses.flatMap((r) => Object.values(r.flags));
  const realFlags = allFlags.filter((f) => !SOFT.has(f)).length;
  const skipped = allFlags.filter((f) => SOFT.has(f)).length;
  const incomplete = responses.filter((r) => missingPages(project, r).length).length;
  const name = slug(project.form.title);

  const order = useMemo(() => {
    const all = responses.flatMap((r) => fields.filter((f) => r.flags[f.var]).map((f) => ({ serial: r.serial, v: f.var, soft: SOFT.has(r.flags[f.var]) })));
    return [...all.filter((o) => !o.soft), ...all.filter((o) => o.soft)];
  }, [responses, fields]);
  const nextFlag = (after?: Sel) => {
    if (!order.length) return null;
    if (!after) return order[0];
    const i = order.findIndex((o) => o.serial === after.serial && o.v === after.v);
    return order[i + 1] ?? order.find((o) => !(o.serial === after.serial && o.v === after.v)) ?? null;
  };

  const set = (s: Sel, changes: Record<string, number | string | null>, advance = true) => {
    update((p) => setAnswers(p, s.serial, changes));
    if (advance) setSel(nextFlag(s));
  };

  const confirmSkipped = async () => {
    if (!(await confirmDialog(`Confirm ${skipped} skipped answers as missing?`, 'Unticked tick-all questions and empty answer boxes become missing (blank) in the export. Every change is kept in the corrections log.', 'Confirm all'))) return;
    update((p) => {
      let q = p;
      for (const r of p.responses) {
        const changes: Record<string, null> = {};
        for (const [v, f] of Object.entries(r.flags)) if (SOFT.has(f)) changes[v] = null;
        if (Object.keys(changes).length) q = setAnswers(q, r.serial, changes);
      }
      return q;
    });
  };

  const removePicked = async () => {
    const list = [...picked];
    if (!(await confirmDialog(`Delete ${list.length} participant(s)?`, `IDs ${list.map(formatSerial).join(', ')}. Their sheets can be scanned again later.`, 'Delete', true))) return;
    update((p) => deleteResponses(p, list));
    setPicked(new Set());
    setSel(null);
  };

  const merge = async (file: File) => {
    setMsg('');
    try {
      const other = await readProjectFile(file);
      const { project: merged, report } = mergeProjects(project, other, file.name);
      update(() => merged);
      setMsg(`Merged ${file.name}: ${report.addedResponses} new participants, ${report.addedBatches} print batches.` +
        (report.clashes.length ? ` IDs ${report.clashes.join(', ')} appear in both files with different answers; choose what to keep below.` : '') +
        (report.skippedDeleted.length ? ` ${report.skippedDeleted.length} participant(s) you had deleted stayed deleted.` : ''));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const exportXlsx = () => download(toXlsx([{ name: 'Data', table: dataTable(project) }, { name: 'Codebook', table: codebookTable(project) }, { name: 'Corrections', table: correctionsTable(project) }]), `${name}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const r = sel ? responses.find((x) => x.serial === sel.serial) : undefined;
  const f = sel ? fields.find((x) => x.var === sel.v) : undefined;
  const togglePick = (s: number) => setPicked((old) => { const n = new Set(old); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  return (
    <div className="stack-lg">
      <PageHead step={4} title={<>Check and <em>export</em></>}
        lead="One row per participant. Highlighted answers were faint, doubled, skipped or handwritten: check them first, then download for Excel, SPSS or R." />
      <div className="tally grain">
        <div><b>{responses.length}</b><small>participants</small></div>
        <div><b>{printedCount(project)}</b><small>copies printed</small></div>
        <div className={realFlags ? 'flagged' : ''}><b>{realFlags}</b><small>answers to check</small></div>
        <div><b>{incomplete}</b><small>missing a page</small></div>
      </div>

      {(project.clashes ?? []).length > 0 && <Clashes project={project} update={update} />}

      <div className="toolbar">
        {order.length > 0 && <button className="primary" onClick={() => setSel(nextFlag())}>Check flagged answers ({order.length})</button>}
        {skipped > 0 && <button onClick={confirmSkipped}>Confirm {skipped} skipped as missing</button>}
        {picked.size > 0 && <button className="danger" onClick={removePicked}>Delete {picked.size} selected</button>}
        <span className="grow" />
        <button className="ghost" onClick={() => mergeRef.current?.click()}>Merge a teammate's file</button>
        <input ref={mergeRef} type="file" hidden accept=".tallyleaf,.psyform,.json" onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl) merge(fl); }} />
      </div>
      {msg && <div className="note info">{msg}</div>}

      <div className="panel grain stack exportbox">
        <div className="row"><h3 className="grow" style={{ margin: 0 }}>Download</h3>{order.length > 0 && <span className="hl small">{order.length} answers not checked yet: they export as the scanner's best guess</span>}</div>
        <div className="toolbar">
          <button onClick={exportXlsx} disabled={!responses.length}><Icon name="data" />Excel (data, codebook, corrections)</button>
          <button onClick={() => download(spssSyntax(project), `${name}.sps`, 'text/plain')} disabled={!responses.length} title="Open in SPSS or PSPP and Run All. The data is inside the file, with every label.">SPSS (.sps)</button>
          <button onClick={() => download(toCsv(dataTable(project)), `${name}.csv`, 'text/csv')} disabled={!responses.length}>CSV (for R)</button>
          <button className="ghost" onClick={() => download(toCsv(codebookTable(project)), `${name}_codebook.csv`, 'text/csv')}>Codebook</button>
          {(project.log ?? []).length > 0 && <button className="ghost" onClick={() => download(toCsv(correctionsTable(project)), `${name}_corrections.csv`, 'text/csv')}>Corrections log ({project.log!.length})</button>}
        </div>
        <small className="muted">The export adds <code>_sum</code>, <code>_mean</code> and <code>_n</code> for each subscale. A sum is blank if any item is missing; check <code>_n</code> before using a mean. Reverse-scored items are flipped only inside the scores, never in the raw columns.</small>
      </div>

      {responses.length === 0 ? (
        <div className="empty">
          <h3>No rows yet</h3>
          <p style={{ margin: 0 }}>Scan some filled sheets and each participant appears here as one row.</p>
        </div>
      ) : (
        <div className="split">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="idcol">ID</th>
                  {fields.map((x) => <th key={x.var} title={x.label}>{x.var}</th>)}
                </tr>
              </thead>
              <tbody>
                {responses.map((row) => {
                  const miss = missingPages(project, row);
                  return (
                    <tr key={row.serial}>
                      <td className="idcol">
                        <label className="pick">
                          <input type="checkbox" checked={picked.has(row.serial)} onChange={() => togglePick(row.serial)} aria-label={`Select ID ${formatSerial(row.serial)}`} />
                          {formatSerial(row.serial)}
                        </label>
                        {miss.length ? <span className="miss-tag" title={`Page ${miss.join(', ')} not scanned yet`}>p{miss.join(',')}?</span> : null}
                      </td>
                      {fields.map((x) => {
                        const flag = row.flags[x.var];
                        const isSel = sel?.serial === row.serial && sel.v === x.var;
                        const v = row.values[x.var];
                        const notScanned = !row.pages.includes(x.page);
                        return (
                          <td key={x.var} className={`${flag ? (SOFT.has(flag) ? 'flag soft' : 'flag') : ''} ${isSel ? 'sel' : ''} ${notScanned ? 'miss' : ''}`}>
                            <button className="cell" onClick={() => setSel({ serial: row.serial, v: x.var })} aria-label={`${x.var} for ID ${formatSerial(row.serial)}${flag ? ', needs checking' : ''}`}>
                              {notScanned ? '·' : v === null || v === undefined ? (flag ? '?' : '') : typeof v === 'string' ? (v.length > 14 ? `${v.slice(0, 14)}…` : v) : v}
                              {flag && !SOFT.has(flag) ? <span className="flag-dot" aria-hidden="true" /> : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={`sticky inspector-wrap ${r && f ? 'open' : ''}`}>
            {r && f && sel ? (
              <Review key={`${sel.serial}:${sel.v}`} project={project} r={r} f={f} fields={fields}
                onSet={(changes, adv) => set(sel, changes, adv)} onSkip={() => setSel(nextFlag(sel))} onClose={() => setSel(null)} />
            ) : (
              <div className="empty desktop-only">
                <p style={{ margin: 0 }}>{order.length ? <>Use <b>Check flagged answers</b> to go through them one by one, or click any cell.</> : 'Click any cell to see what was read and correct it.'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Clashes({ project, update }: { project: Project; update: Update }) {
  const list = project.clashes ?? [];
  return (
    <div className="note warn stack">
      <b>{list.length} ID{list.length === 1 ? ' appears' : 's appear'} on two different sheets</b>
      <span>Usually two teammates printed the same IDs. Nothing was thrown away. For each, choose which sheet is right, or keep both (the second one gets a new ID; its printed ID stays in <code>original_serial</code>).</span>
      {list.map((c, i) => {
        const mine = project.responses.find((r) => r.serial === c.serial);
        return (
          <div className="row clash" key={`${c.serial}-${i}`}>
            <b className="mono">ID {formatSerial(c.serial)}</b>
            <small className="grow">yours: {mine ? `${Object.values(mine.values).filter((v) => v !== null).length} answers` : 'none'} · from {c.source}: {Object.values(c.response.values).filter((v) => v !== null).length} answers</small>
            <button className="small" onClick={() => update((p) => resolveClash(p, i, 'both'))}>Keep both</button>
            <button className="small" onClick={() => update((p) => resolveClash(p, i, 'mine'))}>Keep yours</button>
            <button className="small" onClick={() => update((p) => resolveClash(p, i, 'theirs'))}>Use theirs</button>
          </div>
        );
      })}
    </div>
  );
}

function Review({ project, r, f, fields, onSet, onSkip, onClose }: {
  project: Project; r: Response; f: Field; fields: Field[];
  onSet: (changes: Record<string, number | string | null>, advance?: boolean) => void; onSkip: () => void; onClose: () => void;
}) {
  const flag = r.flags[f.var];
  const value = r.values[f.var];
  const group = f.type === 'check' ? fields.filter((x) => x.group === f.group) : [f];
  const crop = r.crops[f.var] ?? group.map((x) => r.crops[x.var]).find(Boolean);
  const [text, setText] = useState(typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
  const [err, setErr] = useState('');
  const scanned = r.pages.includes(f.page);
  const labelOf = (v: number | string | null | undefined) => (v === null || v === undefined ? 'missing' : f.valueLabels?.find((o) => o.value === v)?.label ?? String(v));
  const all = (v: number | null) => Object.fromEntries(group.map((x) => [x.var, v]));

  const save = () => {
    const t = text.trim();
    if (f.type === 'digits' && t && !/^\d+$/.test(t)) { setErr('Digits only, please.'); return; }
    if (f.type === 'digits' && f.digits && t.length > f.digits) { setErr(`At most ${f.digits} digits.`); return; }
    onSet({ [f.var]: t === '' ? null : f.type === 'digits' ? (f.asText ? t : Number(t)) : t });
  };

  return (
    <div className="sheet inspector stack" role="region" aria-label="Check this answer">
      <div className="row">
        <span className="kicker grow">ID {formatSerial(r.serial)} · page {f.page} · {f.var}</span>
        <button className="icon-btn ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      <h3 style={{ margin: 0 }}>{f.type === 'check' && flag === 'group-empty' ? f.label.split(' — ')[0] : f.label}</h3>
      {!scanned && <div className="note warn">Page {f.page} for this participant hasn't been scanned yet.</div>}
      {flag && <div className="note warn">{FLAG_TEXT[flag]}</div>}
      {crop ? <img className="crop" src={crop} alt={`What was on the sheet for ${f.var}`} /> : scanned && <small className="muted">Read cleanly, so no picture was kept.</small>}

      {f.type === 'check' && flag === 'group-empty' ? (
        <div className="answers">
          <button onClick={() => onSet(all(0))}>None of these apply (all 0)</button>
          <button onClick={() => onSet(all(null))}>Skipped (missing)</button>
        </div>
      ) : (f.type === 'choice' || f.type === 'check') && (
        <div className="answers">
          {(f.valueLabels ?? []).map((o) => (
            <button key={o.value} aria-pressed={value === o.value} onClick={() => onSet({ [f.var]: o.value })}><span className="v">{o.value}</span>{o.label}</button>
          ))}
          <button aria-pressed={value === null} onClick={() => onSet({ [f.var]: null })}>Missing</button>
        </div>
      )}
      {(f.type === 'digits' || f.type === 'text') && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {f.type === 'text'
            ? <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="What the participant wrote" placeholder="Type what they wrote; leave empty if nothing" />
            : <input className="mono" inputMode="numeric" value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} aria-label="Number" />}
          {err && <small className="danger">{err}</small>}
          <div><button className="primary" type="submit">Save and next</button></div>
        </form>
      )}
      <div className="row" style={{ borderTop: '1px dashed var(--line-2)', paddingTop: '.7rem' }}>
        {flag && flag !== 'group-empty' && <button className="small" onClick={() => onSet({ [f.var]: value ?? null })}>Keep: {labelOf(value)}</button>}
        <button className="small ghost" onClick={onSkip}>Skip</button>
        <span className="grow" />
        <small className="muted">{(project.log ?? []).filter((c) => c.serial === r.serial && c.var === f.var).length ? 'changed before, see corrections log' : ''}</small>
      </div>
    </div>
  );
}

