import { useEffect, useMemo, useState } from 'react';
import type { Update } from '../App';
import { download, slug } from '../lib/browser';
import { batchPdf, layoutForm, unsupportedChars } from '../lib/pdf';
import { addBatch, addReservation, freezeVersion, lockConflicts, nextFreeSerial, printedCount, serialProblem, versionIndex } from '../lib/project';
import { formatSerial } from '../lib/qr';
import { validateForm, type Batch, type Project } from '../lib/schema';
import { Icon, PageHead, SheetArt } from './art';
import { confirmDialog } from './dialog';

const ME = '';

export function Print({ project, update, saveFile }: { project: Project; update: Update; saveFile: () => void }) {
  const [by, setBy] = useState<string>(() => { try { return localStorage.getItem(`tallyleaf:by:${project.id}`) ?? ME; } catch { return ME; } });
  const [copies, setCopies] = useState(30);
  const [start, setStart] = useState(() => nextFreeSerial(project, by || undefined));
  const [duplex, setDuplex] = useState(true);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [bad, setBad] = useState<string[]>([]);
  const errors = useMemo(() => [...validateForm(project.form), ...lockConflicts(project, project.form)], [project]);
  const n = Math.max(1, Math.min(2000, Math.floor(copies) || 1));
  const from = Math.max(1, Math.floor(start) || 1);
  const problem = serialProblem(project, from, from + n - 1, by || undefined);
  const [pagesPerCopy, setPagesPerCopy] = useState(1);
  const reservations = project.reservations ?? [];
  useEffect(() => {
    layoutForm(project.form).then((l) => setPagesPerCopy(l.pages.length)).catch(() => undefined);
    unsupportedChars(project.form).then(setBad).catch(() => setBad([]));
  }, [project.form]);
  const odd = pagesPerCopy > 1 && pagesPerCopy % 2 === 1;
  const sheets = n * (pagesPerCopy + (duplex && odd ? 1 : 0));

  const choose = (name: string) => {
    setBy(name);
    try { localStorage.setItem(`tallyleaf:by:${project.id}`, name); } catch { /* storage blocked */ }
    setStart(nextFreeSerial(project, name || undefined));
  };

  const reserve = async (name: string, size: number) => {
    const end = Math.max(0, ...project.batches.map((b) => b.to), ...reservations.map((r) => r.to), project.nextSerial - 1);
    const fromR = end + 1;
    update((p) => addReservation(p, name, fromR, fromR + size - 1));
  };

  const generate = async () => {
    setError('');
    setDone('');
    if (bad.length && !(await confirmDialog('Some characters will print as “?”', `The built-in PDF font can't print: ${bad.join(' ')}. Print anyway?`, 'Print anyway'))) return;
    setBusy('Laying out pages…');
    try {
      const layout = await layoutForm(project.form);
      const fv = freezeVersion(project, project.form, layout);
      const { project: next, batch } = addBatch(fv.project, fv.version.fp, from, n, by || undefined);
      setBusy(`Generating ${n} copies (${sheets} pages)…`);
      const bytes = await batchPdf(next, fv.version, batch.from, batch.to, duplex);
      download(bytes, `${slug(project.form.title)}_${formatSerial(batch.from)}-${formatSerial(batch.to)}.pdf`, 'application/pdf');
      update(() => next);
      setStart(nextFreeSerial(next, by || undefined));
      setDone(`Downloaded IDs ${formatSerial(batch.from)}–${formatSerial(batch.to)}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const again = async (b: Batch) => {
    const v = project.versions.find((x) => x.fp === b.fp);
    if (!v) return;
    if (!(await confirmDialog(`Reprint IDs ${formatSerial(b.from)}–${formatSerial(b.to)}?`, 'Only use the reprint to replace copies that were lost or damaged. If both the old and the new copy get filled in, two people share an ID; the scanner keeps the first and skips the second.', 'Reprint'))) return;
    setBusy('Generating…');
    try {
      const bytes = await batchPdf(project, v, b.from, b.to, duplex);
      download(bytes, `${slug(v.form.title)}_${formatSerial(b.from)}-${formatSerial(b.to)}_reprint.pdf`, 'application/pdf');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="stack-lg">
      <div className="hero-grid">
        <div className="stack">
          <PageHead step={2} title={<>Print <em>numbered</em> copies</>}
            lead="Every copy gets its own serial number, which becomes the participant ID. A code on each page tells the scanner whose page it is, so the pile can come back in any order." />
          {errors.length > 0 ? (
            <div className="note warn"><b>Fix these in Build first:</b><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
          ) : (
            <>
              {(reservations.length > 0) && (
                <label className="whoprints">Who is printing?
                  <select value={by} onChange={(e) => choose(e.target.value)}>
                    <option value={ME}>Not using a teammate range</option>
                    {reservations.map((r) => <option key={r.id} value={r.name}>{r.name} (IDs {formatSerial(r.from)}–{formatSerial(r.to)})</option>)}
                  </select>
                </label>
              )}
              <div className="fieldbox panel grain">
                <label>How many copies?<input type="number" min={1} max={2000} value={copies} onChange={(e) => setCopies(Number(e.target.value))} /></label>
                <label>First serial number<input type="number" min={1} value={start} onChange={(e) => setStart(Number(e.target.value))} /></label>
              </div>
              <div className="ticket grain" aria-label={`Serials ${formatSerial(from)} to ${formatSerial(from + n - 1)}`}>
                <div><small>First participant</small><span className="serial">{formatSerial(from)}</span></div>
                <span className="arrow" aria-hidden="true">→</span>
                <div><small>Last participant</small><span className="serial">{formatSerial(from + n - 1)}</span></div>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {n} {n === 1 ? 'copy' : 'copies'} × {pagesPerCopy} {pagesPerCopy === 1 ? 'page' : 'pages'}{duplex && odd ? ' + 1 blank back page' : ''} = {sheets} pages of A4
              </p>
              {odd && (
                <label className="check"><input type="checkbox" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} /> I'll print double-sided: add a blank page after each copy, so two people never share a sheet</label>
              )}
              {problem && (
                <div className="note warn">
                  {problem}{' '}
                  <button className="link" onClick={() => setStart(nextFreeSerial(project, by || undefined))}>Use the next free ID ({formatSerial(nextFreeSerial(project, by || undefined))})</button>
                </div>
              )}
              {bad.length > 0 && <div className="note warn">These characters can't be printed yet and would show as “?”: {bad.join(' ')}. Hindi and other scripts are planned. Replace them in Build, or print anyway.</div>}
              <div><button className="primary big" onClick={generate} disabled={!!busy || !!problem}><Icon name="print" />{busy || `Download PDF (${n} ${n === 1 ? 'copy' : 'copies'})`}</button></div>
            </>
          )}
          {error && <div className="note bad">Couldn't make the PDF: {error}</div>}
          {done && (
            <div className="note good">
              {done} The project now remembers this batch, so <button className="link" onClick={saveFile}>save the project file</button> too. (The PDF carries a copy of the project as well.)
            </div>
          )}
        </div>
        <div className="hero-art"><SheetArt scanning={false} /></div>
      </div>

      <div className="tipbox panel grain">
        <div className="tiphead"><Icon name="info" size={30} /><h3>Before you hit print</h3></div>
        <ul className="checks">
          <li><Icon name="check" size={18} />A4, single- or double-sided. “Fit to page” is fine; the scanner corrects for scale.</li>
          <li><Icon name="check" size={18} />Don't photocopy one printed copy for several people. Each person needs their own serial.</li>
          <li><Icon name="check" size={18} />Ask participants to fill the circle with a dark pen. Ticks and crosses are read too; anything unclear is flagged for you to check.</li>
          <li><Icon name="check" size={18} />Hand copies out in random order and keep consent forms separate, so an ID can't be traced back to a name.</li>
        </ul>
      </div>

      <section>
        <h2>Print log <small className="muted mono" style={{ fontSize: '.8rem', fontWeight: 400 }}>{printedCount(project)} printed so far</small></h2>
        {project.batches.length === 0 ? (
          <div className="empty"><p style={{ margin: 0 }}>Nothing printed yet. Each batch you download is logged here, and you can reprint it if the printer eats a page.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="ledger">
              <thead><tr><th>IDs</th><th>Copies</th><th>By</th><th>Version</th><th>Date</th><th /></tr></thead>
              <tbody>
                {[...project.batches].reverse().map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{formatSerial(b.from)}–{formatSerial(b.to)}</td>
                    <td className="mono">{b.to - b.from + 1}</td>
                    <td>{b.by ?? '—'}</td>
                    <td className="mono">v{versionIndex(project, b.fp)}</td>
                    <td className="muted">{new Date(b.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
                    <td style={{ textAlign: 'right' }}><button className="small" disabled={!!busy} onClick={() => again(b)}>Reprint</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {project.versions.length > 1 && <p className="muted small">The version goes up when you edit questions after printing. Every version scans into the same spreadsheet.</p>}
      </section>
      <Teammates project={project} onReserve={reserve} />
    </div>
  );
}

function Teammates({ project, onReserve }: { project: Project; onReserve: (name: string, size: number) => void }) {
  const [name, setName] = useState('');
  const [size, setSize] = useState(100);
  const list = project.reservations ?? [];
  return (
    <section className="panel grain stack">
      <h3 style={{ margin: 0 }}>Printing with teammates?</h3>
      <p className="muted" style={{ margin: 0 }}>
        If two people print from copies of this project file, they'd both print IDs from the same start, and two different people would share an ID.
        Give each teammate their own range here, save the project file and send it to them. Each of you then picks your name above.
      </p>
      {list.length > 0 && (
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th>Teammate</th><th>IDs</th><th>Printed</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}><td>{r.name}</td><td className="mono">{formatSerial(r.from)}–{formatSerial(r.to)}</td>
                  <td className="mono">{project.batches.filter((b) => b.by === r.name).reduce((a, b) => a + b.to - b.from + 1, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onReserve(name, Math.max(1, size)); setName(''); } }}>
        <label className="grow">Teammate's name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya" /></label>
        <label style={{ width: 130 }}>How many IDs<input type="number" min={1} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        <button type="submit" disabled={!name.trim() || list.some((r) => r.name === name.trim())}>Reserve range</button>
      </form>
    </section>
  );
}
