import { useRef, useState, useSyncExternalStore } from 'react';
import type { Update } from '../App';
import { scanQueue } from '../lib/scanQueue';
import type { Project } from '../lib/schema';
import { Icon, PageHead } from './art';
import { confirmDialog } from './dialog';

export function Scan({ project, onDone, saveFile }: { project: Project; update: Update; onDone: () => void; saveFile: () => void }) {
  const q = useSyncExternalStore(scanQueue.subscribe, scanQueue.get);
  const [replace, setReplace] = useState(false);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [over, setOver] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const busy = q.busy;
  const counts = { ok: q.log.filter((l) => l.kind === 'ok').length, warn: q.log.filter((l) => l.kind === 'warn').length, err: q.log.filter((l) => l.kind === 'err').length };
  const unsaved = !project.lastFileSaveAt || project.updatedAt > project.lastFileSaveAt;

  const onFiles = (list: FileList | null) => {
    scanQueue.add(Array.from(list ?? []), { replace, includeEmpty });
    if (replace) setReplace(false);
  };

  const undo = async () => {
    if (!q.undo) return;
    if (await confirmDialog(`Undo the last scan session?`, `This removes the ${q.undo.pages} page(s) read in that session, and any checks you made since then.`, 'Undo', true)) scanQueue.undo();
  };

  if (!project.versions.length) {
    return (
      <div className="stack-lg">
        <PageHead step={3} title={<>Scan the <em>filled</em> sheets</>} lead="The scanner reads sheets this project printed." />
        <div className="empty">
          <h3>Nothing has been printed from this project yet</h3>
          <p style={{ margin: 0 }}>Download copies in <b>Print</b> first. If the sheets were printed on another device, go home and open that project file (or one of the PDFs it made), then scan here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <PageHead step={3} title={<>Scan the <em>filled</em> sheets</>}
        lead="Phone photos or scanner PDFs. Shuffled piles, mixed participants, page 2 before page 1: all fine. Each page finds its own participant. You can switch tabs while it works." />
      <div className="split">
        <div className="stack">
          <div
            className={`drop grain ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
          >
            <div className="light" />
            <div className="drop-actions">
              <button className="primary big" onClick={() => camRef.current?.click()}><Icon name="camera" />Take a photo</button>
              <button className="big" onClick={() => pickRef.current?.click()}><Icon name="upload" />Choose photos or PDFs</button>
            </div>
            <p className="muted desktop-only" style={{ margin: 0 }}>…or drag the files onto this box. One page per photo.</p>
            <input ref={pickRef} type="file" multiple hidden accept="image/*,application/pdf,.heic,.heif" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
            <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
            <details className="drop-opts">
              <summary>Options</summary>
              <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Overwrite pages already scanned (next upload only: use it to re-scan the same sheet, never for a photocopy)</label>
              <label className="check"><input type="checkbox" checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} /> Keep pages with no marks at all (a participant skipped a whole page)</label>
            </details>
            {busy && <div className="status" aria-live="polite"><span className="spinner" />{busy}{q.pending ? ` · ${q.pending} more file(s) queued` : ''}</div>}
          </div>

          <div className="tipbox panel grain">
            <div className="tiphead"><Icon name="info" size={30} /><h3>Getting a clean read</h3></div>
            <ul className="checks">
              <li><Icon name="check" size={18} />One page per photo, with all four black corner squares and the code in the picture.</li>
              <li><Icon name="check" size={18} />Lay sheets flat in even light and shoot from above. Some tilt is fine; avoid glare on the code.</li>
              <li><Icon name="check" size={18} />For 50+ sheets, a scanner or the office copier's “scan to PDF” is faster than a phone.</li>
            </ul>
          </div>
        </div>

        <div className="tape" aria-label="Scan results">
          <div className="head">SCAN RECEIPT · {new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          {q.log.length === 0 && <p style={{ textAlign: 'center', color: 'var(--faint)', margin: '1.5rem 0' }}>Nothing scanned in this session yet.<br />{project.responses.length} participants on file.</p>}
          <div className="log">
            {q.log.map((l) => (
              <div className={`line ${l.kind === 'warn' ? 'warn' : ''}`} key={l.id}>
                <span className={l.kind === 'ok' ? 'ok' : l.kind === 'warn' ? '' : 'err'}>{l.kind === 'ok' ? '✓' : l.kind === 'warn' ? '!' : '✕'}</span>
                <div>{l.text}{l.label && <small>{l.label}</small>}</div>
              </div>
            ))}
          </div>
          {q.log.length > 0 && (
            <>
              <div className="total"><span>READ {counts.ok + counts.warn}</span><span>CHECK {counts.warn}</span><span>FAILED {counts.err}</span></div>
              {!busy && (
                <div className="tape-actions">
                  <button className="primary" onClick={onDone}>Check the data →</button>
                  {unsaved && <button onClick={saveFile}><Icon name="save" />Save project file</button>}
                  {q.undo && q.undo.projectId === project.id && q.undo.pages > 0 && <button className="ghost danger" onClick={undo}>Undo this session</button>}
                  <button className="ghost" onClick={() => scanQueue.clearLog()}>Clear receipt</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
