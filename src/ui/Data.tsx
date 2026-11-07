import { useMemo, useRef, useState } from 'react';
import type { Update } from '../App';
import { download, slug } from '../lib/browser';
import { codebookTable, dataTable, spssSyntax, toCsv, toXlsx } from '../lib/export';
import { allFields, mergeProjects, missingPages, setAnswer } from '../lib/project';
import { formatSerial } from '../lib/qr';
import type { Field, Flag, Project, Response } from '../lib/schema';
import { readProjectFile } from './Home';
import { PageHead } from './art';

const FLAG_TEXT: Record<Flag, string> = {
  blank: 'Nothing was marked here. Confirm it was skipped, or pick the answer.',
  faint: 'Only a very light mark. Was it meant as an answer?',
  multiple: 'Two or more options are marked. Pick the one they meant, or Missing.',
  unclear: 'The marks are hard to tell apart. Pick the intended answer.',
  'missing-page': 'Page not scanned yet.',
  text: 'Type what the participant wrote (or leave empty).',
};

type Sel = { serial: number; v: string };

export function DataView({ project, update }: { project: Project; update: Update }) {
  const fields = useMemo(() => allFields(project), [project]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [msg, setMsg] = useState('');
  const mergeRef = useRef<HTMLInputElement>(null);
  const responses = project.responses;
  const flagCount = responses.reduce((s, r) => s + Object.keys(r.flags).length, 0);
  const blankCount = responses.reduce((s, r) => s + Object.values(r.flags).filter((f) => f === 'blank').length, 0);
  const incomplete = responses.filter((r) => missingPages(project, r).length).length;
  const name = slug(project.form.title);

  const order = useMemo(() => responses.flatMap((r) => fields.filter((f) => r.flags[f.var]).map((f) => ({ serial: r.serial, v: f.var }))), [responses, fields]);
  const nextFlag = (after?: Sel) => {
    if (!order.length) return null;
    if (!after) return order[0];
    const i = order.findIndex((o) => o.serial === after.serial && o.v === after.v);
    return order[i + 1] ?? order.find((o) => !(o.serial === after.serial && o.v === after.v)) ?? null;
  };

  const set = (s: Sel, value: number | string | null, advance = true) => {
    update((p) => setAnswer(p, s.serial, s.v, value));
    if (advance) setSel(nextFlag(s));
  };

  const acceptBlanks = () =>
    update((p) => ({
      ...p,
      responses: p.responses.map((r) => ({ ...r, flags: Object.fromEntries(Object.entries(r.flags).filter(([, f]) => f !== 'blank')) as Record<string, Flag> })),
    }));

  const merge = async (file: File) => {
    setMsg('');
    try {
      const other = await readProjectFile(file);
      const { project: merged, report } = mergeProjects(project, other);
      update(() => merged);
      setMsg(`Merged: ${report.addedResponses} new participants, ${report.addedBatches} print batches, ${report.addedVersions} versions.` +
        (report.conflicts.length ? ` Serial(s) ${report.conflicts.join(', ')} exist in both files with different answers; your copy was kept.` : ''));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const exportXlsx = () => download(toXlsx([{ name: 'Data', table: dataTable(project) }, { name: 'Codebook', table: codebookTable(project) }]), `${name}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const r = sel ? responses.find((x) => x.serial === sel.serial) : undefined;
  const f = sel ? fields.find((x) => x.var === sel.v) : undefined;

  return (
    <div className="stack-lg">
      <PageHead step={4} title={<>Check and <em>export</em></>}
        lead="One row per participant. Highlighted answers were faint, doubled or blank: check them, then download for Excel, SPSS or R." />
      <div className="tally grain">
        <div><b>{responses.length}</b><small>participants</small></div>
        <div><b>{project.nextSerial - 1}</b><small>copies printed</small></div>
        <div className={flagCount ? 'flagged' : ''}><b>{flagCount}</b><small>answers to check</small></div>
        <div><b>{incomplete}</b><small>missing a page</small></div>
      </div>

      <div className="toolbar">
        <button className="primary" onClick={exportXlsx} disabled={!responses.length}>Download Excel</button>
        <button onClick={() => download(toCsv(dataTable(project)), `${name}.csv`, 'text/csv')} disabled={!responses.length}>CSV</button>
        <button onClick={() => download(spssSyntax(project, `${name}.csv`), `${name}.sps`, 'text/plain')} disabled={!responses.length} title="Reads the CSV into SPSS with every variable and value label. Download the CSV too.">SPSS syntax</button>
        <button onClick={() => download(toCsv(codebookTable(project)), `${name}_codebook.csv`, 'text/csv')}>Codebook</button>
        <span className="sep" />
        {order.length > 0 && <button onClick={() => setSel(nextFlag())}>Check flagged ({order.length})</button>}
        {blankCount > 0 && <button className="ghost" onClick={acceptBlanks}>Mark {blankCount} blanks as missing</button>}
        <span className="grow" />
        <button className="ghost" onClick={() => mergeRef.current?.click()}>Merge a teammate's file</button>
        <input ref={mergeRef} type="file" hidden accept=".tallyleaf,.psyform,.json,.pdf" onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl) merge(fl); }} />
      </div>
      {msg && <div className="note info">{msg}</div>}
      {flagCount > 0 && <div className="note warn">{flagCount} answers are <span className="hl">highlighted</span> because the marks were faint, doubled or missing. Exports use the scanner's best guess until you check them.</div>}

      {responses.length === 0 ? (
        <div className="empty">
          <h3>No rows yet</h3>
          <p style={{ margin: 0 }}>Scan some filled sheets and each participant appears here as one row, ready to export.</p>
        </div>
      ) : (
        <div className="split">
          <div>
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
                        <td className="idcol" title={miss.length ? `Page ${miss.join(', ')} not scanned yet` : undefined}>{formatSerial(row.serial)}{miss.length ? <span style={{ color: 'var(--red-ink)' }}> ·p{miss.join(',')}?</span> : null}</td>
                        {fields.map((x) => {
                          const flag = row.flags[x.var];
                          const isSel = sel?.serial === row.serial && sel.v === x.var;
                          const v = row.values[x.var];
                          const notScanned = !row.pages.includes(x.page);
                          return (
                            <td key={x.var} className={`${flag ? 'flag' : ''} ${isSel ? 'sel' : ''} ${notScanned ? 'miss' : ''}`} onClick={() => setSel({ serial: row.serial, v: x.var })} title={flag ? FLAG_TEXT[flag] : x.label}>
                              {notScanned ? '·' : v === null || v === undefined ? (flag ? '?' : '') : typeof v === 'string' ? (v.length > 14 ? `${v.slice(0, 14)}…` : v) : v}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: '.82rem', marginTop: '.6rem' }}>
              The export adds <span className="mono">_sum</span>, <span className="mono">_mean</span> and <span className="mono">_n</span> for each subscale. A sum is left blank if any item is missing; reverse-scored items are flipped only inside the scores.
            </p>
          </div>
          <div className="sticky">
            {r && f && sel ? (
              <Review key={`${sel.serial}:${sel.v}`} r={r} f={f} onSet={(v, adv) => set(sel, v, adv)} onSkip={() => setSel(nextFlag(sel))}
                onDelete={() => {
                  if (!confirm(`Delete every answer from participant ${formatSerial(r.serial)}? You can scan their sheets again afterwards.`)) return;
                  update((p) => ({ ...p, responses: p.responses.filter((x) => x.serial !== r.serial) }));
                  setSel(null);
                }} />
            ) : (
              <div className="empty">
                <p style={{ margin: 0 }}>{order.length ? <>Click a <span className="hl">highlighted</span> cell, or use <b>Check flagged</b> to go through them one by one.</> : 'Click any cell to see what was read and correct it.'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Review({ r, f, onSet, onSkip, onDelete }: { r: Response; f: Field; onSet: (v: number | string | null, advance?: boolean) => void; onSkip: () => void; onDelete: () => void }) {
  const flag = r.flags[f.var];
  const value = r.values[f.var];
  const crop = r.crops[f.var];
  const [text, setText] = useState(typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
  const scanned = r.pages.includes(f.page);

  return (
    <div className="sheet inspector stack">
      <div className="row"><span className="kicker grow">ID {formatSerial(r.serial)} · page {f.page}</span><span className="mono muted" style={{ fontSize: '.8rem' }}>{f.var}</span></div>
      <h3 style={{ margin: 0 }}>{f.label}</h3>
      {!scanned && <div className="note warn">Page {f.page} for this participant hasn't been scanned yet.</div>}
      {flag && <div className="note warn">{FLAG_TEXT[flag]}</div>}
      {crop ? <img className="crop" src={crop} alt={`What was on the sheet for ${f.var}`} /> : scanned && <small>Read cleanly, so no picture was kept.</small>}

      {(f.type === 'choice' || f.type === 'check') && (
        <div className="answers">
          {(f.valueLabels ?? []).map((o) => (
            <button key={o.value} aria-pressed={value === o.value} onClick={() => onSet(o.value)}><span className="v">{o.value}</span>{o.label}</button>
          ))}
          {f.type === 'choice' && <button aria-pressed={value === null} onClick={() => onSet(null)}>Missing</button>}
        </div>
      )}
      {(f.type === 'digits' || f.type === 'text') && (
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          onSet(t === '' ? null : f.type === 'digits' ? (Number.isFinite(Number(t)) ? Number(t) : t) : t);
        }}>
          {f.type === 'text'
            ? <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="What the participant wrote" placeholder="Type what they wrote" autoFocus />
            : <input className="mono" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} aria-label="Number" autoFocus />}
          <div><button className="primary" type="submit">Save and next</button></div>
        </form>
      )}
      <div className="row" style={{ borderTop: '1px dashed var(--rule)', paddingTop: '.7rem' }}>
        {flag && <button className="small" onClick={() => onSet(value ?? null)}>Keep {value ?? 'missing'}</button>}
        <button className="small ghost" onClick={onSkip}>Skip</button>
        <span className="grow" />
        <button className="small ghost danger" onClick={onDelete}>Delete participant</button>
      </div>
    </div>
  );
}
