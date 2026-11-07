import { useEffect, useRef, useState } from 'react';
import type { Update } from '../App';
import { filePages, grayToDataUrl } from '../lib/browser';
import { applyPage } from '../lib/project';
import { formatSerial } from '../lib/qr';
import type { Flag, Project } from '../lib/schema';
import type { WorkerIn, WorkerOut } from '../lib/scanWorker';
import { Icon, PageHead } from './art';

type Entry = { label: string; kind: 'ok' | 'err' | 'warn'; text: string };

export function Scan({ project, update, onDone }: { project: Project; update: Update; onDone: () => void }) {
  const [log, setLog] = useState<Entry[]>([]);
  const [busy, setBusy] = useState('');
  const [replace, setReplace] = useState(false);
  const [over, setOver] = useState(false);
  const projRef = useRef(project);
  const worker = useRef<Worker | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  projRef.current = busy ? projRef.current : project;

  useEffect(() => () => worker.current?.terminate(), []);

  const scanOne = (msg: Omit<WorkerIn, 'id'>): Promise<WorkerOut> => {
    worker.current ??= new Worker(new URL('../lib/scanWorker.ts', import.meta.url), { type: 'module' });
    const id = Math.random();
    return new Promise((resolve) => {
      const w = worker.current!;
      const onMsg = (e: MessageEvent<WorkerOut>) => {
        if (e.data.id !== id) return;
        w.removeEventListener('message', onMsg);
        resolve(e.data);
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ ...msg, id }, [msg.img.data.buffer]);
    });
  };

  const run = async (files: File[]) => {
    if (!files.length) return;
    const add = (e: Entry) => setLog((l) => [e, ...l]);
    let n = 0;
    projRef.current = project;
    for (const file of files) {
      try {
        for await (const pg of filePages(file)) {
          n++;
          setBusy(`Reading ${pg.label}…`);
          const res = await scanOne({ img: pg.rgba, projectId: projRef.current.id, versions: projRef.current.versions });
          if (!res.ok) {
            add({ label: pg.label, kind: 'err', text: res.error });
            continue;
          }
          const crops = Object.fromEntries(Object.entries(res.crops).map(([k, g]) => [k, grayToDataUrl(g)]));
          const fields = res.fields as Record<string, { value: number | string | null; flag?: Flag }>;
          const r = applyPage(projRef.current, { serial: res.serial, fp: res.fp, page: res.page, fields, crops }, replace);
          const who = `ID ${formatSerial(res.serial)}, page ${res.page}`;
          if (r.status === 'duplicate') {
            add({ label: pg.label, kind: 'warn', text: `${who} was already scanned, so this copy was skipped. Tick “Overwrite” to replace it.` });
            continue;
          }
          if (r.status === 'conflict') {
            add({ label: pg.label, kind: 'err', text: `${who}: this serial was already scanned from a different questionnaire version. Check for duplicate serials.` });
            continue;
          }
          projRef.current = r.project;
          update(() => r.project);
          const flags = Object.values(fields).filter((f) => f.flag && f.flag !== 'blank').length;
          const blanks = Object.values(fields).filter((f) => f.flag === 'blank').length;
          const extra = [flags && `${flags} to check`, blanks && `${blanks} blank`].filter(Boolean).join(', ');
          add({ label: pg.label, kind: flags ? 'warn' : 'ok', text: `${who} ${r.status === 'replaced' ? 'replaced' : 'read'}${extra ? ` · ${extra}` : ''}` });
        }
      } catch (e) {
        add({ label: file.name, kind: 'err', text: `Could not open this file: ${(e as Error).message}` });
      }
    }
    setBusy('');
    if (!n) add({ label: '', kind: 'err', text: 'No pages found in the selected files.' });
  };

  const onFiles = (list: FileList | null) => run(Array.from(list ?? []));
  const counts = { ok: log.filter((l) => l.kind === 'ok').length, warn: log.filter((l) => l.kind === 'warn').length, err: log.filter((l) => l.kind === 'err').length };

  if (!project.versions.length) {
    return (
      <div className="stack-lg">
      <PageHead step={3} title={<>Scan the <em>filled</em> sheets</>} lead="The scanner reads sheets this project printed." />
      <div className="empty">
        <h3>Nothing has been printed from this project yet</h3>
        <p style={{ margin: 0 }}>The scanner only knows sheets this project printed. Download copies in <b>Print</b> first. If the sheets were printed on another computer, go home and open that project file, or any PDF it generated.</p>
      </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <PageHead step={3} title={<>Scan the <em>filled</em> sheets</>}
        lead="Phone photos or scanner PDFs. Shuffled piles, mixed participants, page 2 before page 1: all fine. Each page finds its own participant." />
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
            <button className="primary big" disabled={!!busy} onClick={() => camRef.current?.click()}><Icon name="camera" />Take a photo</button>
            <button className="big" disabled={!!busy} onClick={() => pickRef.current?.click()}><Icon name="upload" />Choose photos or PDFs</button>
          </div>
          <p className="muted desktop-only" style={{ margin: 0 }}>…or drag the files onto this box.</p>
          <input ref={pickRef} type="file" multiple hidden accept="image/*,application/pdf" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Overwrite pages that were already scanned</label>
          {busy && <div className="status" aria-live="polite"><span className="spinner" />{busy}</div>}
        </div>

        <div className="tipbox panel grain">
          <div className="tiphead"><Icon name="info" size={30} /><h3>Getting a clean read</h3></div>
          <ul className="checks">
            <li><Icon name="check" size={18} />All four black corner squares must be in the photo. That's how the page gets straightened.</li>
            <li><Icon name="check" size={18} />Lay sheets flat in even light and shoot from roughly above. A bit of tilt is fine.</li>
            <li><Icon name="check" size={18} />For 50+ sheets, a scanner or the office copier's “scan to PDF” is faster than a phone.</li>
          </ul>
        </div>
      </div>

      <div className="tape" aria-label="Scan results">
        <div className="head">SCAN RECEIPT · {new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        {log.length === 0 && <p style={{ textAlign: 'center', color: '#7b7466', margin: '1.5rem 0' }}>Nothing scanned in this session yet.<br />{project.responses.length} participants on file.</p>}
        <div className="log">
          {log.map((l, i) => (
            <div className={`line ${l.kind === 'warn' ? 'warn' : ''}`} key={log.length - i}>
              <span className={l.kind === 'ok' ? 'ok' : l.kind === 'warn' ? '' : 'err'}>{l.kind === 'ok' ? '✓' : l.kind === 'warn' ? '!' : '✕'}</span>
              <div>{l.text}{l.label && <small>{l.label}</small>}</div>
            </div>
          ))}
        </div>
        {log.length > 0 && (
          <>
            <div className="total"><span>READ {counts.ok + counts.warn}</span><span>CHECK {counts.warn}</span><span>FAILED {counts.err}</span></div>
            {!busy && <div style={{ textAlign: 'center', marginTop: '1rem' }}><button className="primary" onClick={onDone}>Go to the data →</button></div>}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
