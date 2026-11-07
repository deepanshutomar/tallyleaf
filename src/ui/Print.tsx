import { useEffect, useMemo, useState } from 'react';
import type { Update } from '../App';
import { download, slug } from '../lib/browser';
import { batchPdf, layoutForm } from '../lib/pdf';
import { addBatch, freezeVersion, overlappingBatch, versionIndex } from '../lib/project';
import { formatSerial } from '../lib/qr';
import { validateForm, type Batch, type Project } from '../lib/schema';

export function Print({ project, update, saveFile }: { project: Project; update: Update; saveFile: () => void }) {
  const [copies, setCopies] = useState(30);
  const [start, setStart] = useState(project.nextSerial);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const errors = useMemo(() => validateForm(project.form), [project.form]);
  const n = Math.max(1, Math.min(2000, Math.floor(copies) || 1));
  const from = Math.max(1, Math.floor(start) || 1);
  const overlap = overlappingBatch(project, from, from + n - 1);
  const [pagesPerCopy, setPagesPerCopy] = useState(1);
  useEffect(() => { layoutForm(project.form).then((l) => setPagesPerCopy(l.pages.length)).catch(() => undefined); }, [project.form]);

  const generate = async () => {
    setError('');
    setDone('');
    setBusy('Laying out pages…');
    try {
      const layout = await layoutForm(project.form);
      const fv = freezeVersion(project, project.form, layout);
      const { project: next, batch } = addBatch(fv.project, fv.version.fp, from, n);
      setBusy(`Generating ${n} copies (${n * layout.pages.length} pages)…`);
      const bytes = await batchPdf(next, fv.version, batch.from, batch.to);
      download(bytes, `${slug(project.form.title)}_${formatSerial(batch.from)}-${formatSerial(batch.to)}.pdf`, 'application/pdf');
      update(() => next);
      setStart(batch.to + 1);
      setDone(`Downloaded ${formatSerial(batch.from)}–${formatSerial(batch.to)}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const again = async (b: Batch) => {
    const v = project.versions.find((x) => x.fp === b.fp);
    if (!v) return;
    setBusy('Generating…');
    try {
      const bytes = await batchPdf(project, v, b.from, b.to);
      download(bytes, `${slug(v.form.title)}_${formatSerial(b.from)}-${formatSerial(b.to)}.pdf`, 'application/pdf');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="split">
      <div className="stack">
        <div className="sheet ink stack">
          <div className="kicker">Step 2</div>
          <h2>Print numbered copies</h2>
          <p className="muted" style={{ maxWidth: '38rem' }}>Every copy gets its own serial number, which becomes the participant ID. A code on each page tells the scanner whose page it is, so the pile can come back in any order.</p>
          {errors.length > 0 ? (
            <div className="note warn"><b>Fix these in Build first:</b><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
          ) : (
            <>
              <div className="grid2 bigfield">
                <label>How many copies<input type="number" min={1} max={2000} value={copies} onChange={(e) => setCopies(Number(e.target.value))} /></label>
                <label>First serial<input type="number" min={1} value={start} onChange={(e) => setStart(Number(e.target.value))} /></label>
              </div>
              <div className="ticket" aria-label={`Serials ${formatSerial(from)} to ${formatSerial(from + n - 1)}`}>
                <div className="serial"><small>first participant</small>{formatSerial(from)}</div>
                <div className="arrow">→</div>
                <div className="serial right"><small>last participant</small>{formatSerial(from + n - 1)}</div>
              </div>
              <p className="muted mono" style={{ margin: 0, fontSize: '.8rem' }}>
                {n} {n === 1 ? 'copy' : 'copies'} × {pagesPerCopy} {pagesPerCopy === 1 ? 'page' : 'pages'} = {n * pagesPerCopy} sheets of A4
                {project.batches.length > 0 && from === project.nextSerial && ' · continues your last batch'}
              </p>
              {overlap && (
                <div className="note warn">
                  {formatSerial(overlap.from)}–{formatSerial(overlap.to)} were already printed. Two sheets with the same serial would end up as one participant.{' '}
                  <button className="link" onClick={() => setStart(project.nextSerial)}>Start at {formatSerial(project.nextSerial)}</button>
                </div>
              )}
              <div className="row">
                <button className="primary" onClick={generate} disabled={!!busy || !!overlap}>{busy || `Download PDF (${n} ${n === 1 ? 'copy' : 'copies'})`}</button>
              </div>
            </>
          )}
          {error && <div className="note bad">Couldn't make the PDF: {error}</div>}
          {done && (
            <div className="note good">
              {done} The project now remembers this batch, so <button className="link" onClick={saveFile}>save the project file</button> as well. (The PDF carries a copy of the project too.)
            </div>
          )}
        </div>

        <div className="sheet stack">
          <h3>Before you hit print</h3>
          <ul className="tips">
            <li>A4, single- or double-sided. “Fit to page” is fine; the scanner corrects for scale.</li>
            <li>Don't photocopy one printed copy for several people. Each person needs their own serial.</li>
            <li>Tell participants to fill circles with a dark pen. Ticks and crosses mostly work, and anything unclear gets flagged for you.</li>
          </ul>
        </div>
      </div>

      <div className="sticky stack">
        <div className="section-head"><h3 style={{ margin: 0 }}>Print log</h3><small className="mono">{project.nextSerial - 1} printed so far</small></div>
        {project.batches.length === 0 ? (
          <div className="empty"><p style={{ margin: 0 }}>Nothing printed yet. Each batch you download is logged here, and you can download it again if a printer eats a page.</p></div>
        ) : (
          <table className="ledger">
            <thead><tr><th>Serials</th><th>Ver.</th><th>Date</th><th /></tr></thead>
            <tbody>
              {[...project.batches].reverse().map((b) => (
                <tr key={b.id}>
                  <td className="mono">{formatSerial(b.from)}–{formatSerial(b.to)}<br /><small className="muted">{b.to - b.from + 1} copies</small></td>
                  <td className="mono">v{versionIndex(project, b.fp)}</td>
                  <td className="mono muted">{new Date(b.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
                  <td style={{ textAlign: 'right' }}><button className="small" disabled={!!busy} onClick={() => again(b)}>Reprint</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {project.versions.length > 1 && (
          <p className="muted" style={{ fontSize: '.85rem' }}>The version goes up when you edit questions after printing. Every version scans into the same spreadsheet.</p>
        )}
      </div>
    </div>
  );
}
