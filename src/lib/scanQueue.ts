import { filePages, grayToDataUrl } from './browser';
import { applyPage } from './project';
import { formatSerial } from './qr';
import type { Flag, Project } from './schema';
import type { WorkerIn, WorkerOut } from './scanWorker';

export type Entry = { id: number; label: string; kind: 'ok' | 'err' | 'warn'; text: string };
export type QueueState = {
  busy: string;
  pending: number;
  log: Entry[];
  /** Project as it was before the current/last session, for undo. */
  undo: { projectId: string; snapshot: Project; pages: number } | null;
};

type Host = { get: () => Project | null; set: (p: Project) => void };

let host: Host | null = null;
let state: QueueState = { busy: '', pending: 0, log: [], undo: null };
const listeners = new Set<() => void>();
const files: { file: File; replace: boolean; includeEmpty: boolean }[] = [];
let running = false;
let worker: Worker | null = null;
let nextId = 1;

const emit = (patch: Partial<QueueState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const scanQueue = {
  connect(h: Host) { host = h; },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  get: () => state,
  clearLog() { emit({ log: [] }); },
  add(list: File[], opts: { replace: boolean; includeEmpty: boolean }) {
    const p = host?.get();
    if (!p || !list.length) return;
    if (!running) emit({ undo: { projectId: p.id, snapshot: p, pages: 0 } });
    files.push(...list.map((file) => ({ file, ...opts })));
    emit({ pending: files.length });
    void run();
  },
  undo(): boolean {
    const u = state.undo;
    const p = host?.get();
    if (!u || running || !p || p.id !== u.projectId) return false;
    host!.set({ ...u.snapshot, updatedAt: new Date().toISOString() });
    emit({ undo: null, log: [{ id: nextId++, label: '', kind: 'warn', text: `Undone: the ${u.pages} page(s) from the last scan session were removed.` }, ...state.log] });
    return true;
  },
};

function scanOne(msg: Omit<WorkerIn, 'id'>): Promise<WorkerOut> {
  worker ??= new Worker(new URL('./scanWorker.ts', import.meta.url), { type: 'module' });
  const id = Math.random();
  return new Promise((resolve) => {
    const w = worker!;
    const onMsg = (e: MessageEvent<WorkerOut>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMsg);
      resolve(e.data);
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ ...msg, id }, [msg.img.data.buffer]);
  });
}

const add = (e: Omit<Entry, 'id'>) => emit({ log: [{ ...e, id: nextId++ }, ...state.log] });

async function run() {
  if (running) return;
  running = true;
  const projectId = host?.get()?.id;
  let n = 0;
  while (files.length) {
    const job = files.shift()!;
    emit({ pending: files.length });
    try {
      for await (const pg of filePages(job.file)) {
        n++;
        const p = host?.get();
        if (!p || p.id !== projectId) {
          add({ label: pg.label, kind: 'err', text: 'Stopped: a different project was opened while scanning. Open the right project and add the photos again.' });
          files.length = 0;
          break;
        }
        emit({ busy: `Reading ${pg.label}…` });
        const res = await scanOne({ img: pg.rgba, projectId: p.id, versions: p.versions });
        if (!res.ok) {
          add({ label: pg.label, kind: 'err', text: res.error });
          continue;
        }
        const who = `ID ${formatSerial(res.serial)}, page ${res.page}`;
        if (res.empty && !job.includeEmpty) {
          add({ label: pg.label, kind: 'warn', text: `${who} has no marks at all, so it was skipped (is it an unused copy?). If the participant really left the whole page empty, tick “Keep pages with no marks” and add it again.` });
          continue;
        }
        const crops = Object.fromEntries(Object.entries(res.crops).map(([k, g]) => [k, grayToDataUrl(g)]));
        const fields = res.fields as Record<string, { value: number | string | null; flag?: Flag }>;
        const latest = host!.get()!;
        const r = applyPage(latest, { serial: res.serial, fp: res.fp, page: res.page, fields, crops }, job.replace);
        if (r.status === 'duplicate') {
          add({ label: pg.label, kind: 'warn', text: `${who} is already scanned, so this copy was skipped. If it's a different person's sheet (a photocopy), set it aside and give that person a fresh copy. Only use “Overwrite” when re-scanning the very same sheet.` });
          continue;
        }
        if (r.status === 'conflict') {
          add({ label: pg.label, kind: 'err', text: `${who}: this ID was already scanned from a different version of the questionnaire. Two different sheets carry the same ID; check the printed serials.` });
          continue;
        }
        host!.set(r.project);
        if (state.undo) emit({ undo: { ...state.undo, pages: state.undo.pages + 1 } });
        const list = Object.values(fields);
        const check = list.filter((f) => f.flag && !['blank', 'text-empty', 'group-empty'].includes(f.flag)).length;
        const blank = list.filter((f) => f.flag === 'blank' || f.flag === 'group-empty').length;
        const extra = [check && `${check} to check`, blank && `${blank} skipped?`].filter(Boolean).join(' · ');
        add({ label: pg.label, kind: check ? 'warn' : 'ok', text: `${who} ${r.status === 'replaced' ? 'replaced' : 'read'}${extra ? ` · ${extra}` : ''}` });
      }
    } catch (e) {
      add({ label: job.file.name, kind: 'err', text: (e as Error).message });
    }
  }
  if (!n) add({ label: '', kind: 'err', text: 'No pages found in the selected files.' });
  running = false;
  emit({ busy: '', pending: 0 });
}
