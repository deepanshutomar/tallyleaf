import { useEffect, useRef, useState, type ReactNode } from 'react';

type Req =
  | { kind: 'confirm'; title: string; body?: ReactNode; ok: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; body?: ReactNode; ok: string; value: string; resolve: (v: string | null) => void }
  | { kind: 'alert'; title: string; body?: ReactNode; resolve: () => void };

let push: ((r: Req) => void) | null = null;

export const confirmDialog = (title: string, body?: ReactNode, ok = 'OK', danger = false) =>
  new Promise<boolean>((resolve) => (push ? push({ kind: 'confirm', title, body, ok, danger, resolve }) : resolve(window.confirm(title))));

export const promptDialog = (title: string, value = '', body?: ReactNode, ok = 'Save') =>
  new Promise<string | null>((resolve) => (push ? push({ kind: 'prompt', title, body, ok, value, resolve }) : resolve(window.prompt(title, value))));

export const alertDialog = (title: string, body?: ReactNode) =>
  new Promise<void>((resolve) => (push ? push({ kind: 'alert', title, body, resolve }) : (window.alert(title), resolve())));

/** Renders the in-app replacements for confirm(), prompt() and alert(). Mount once. */
export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  const [text, setText] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  const cur = queue[0];

  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    return () => { push = null; };
  }, []);

  useEffect(() => {
    if (!cur) return;
    if (cur.kind === 'prompt') setText(cur.value);
    if (!ref.current?.open) ref.current?.showModal();
  }, [cur]);

  const done = (answer: boolean) => {
    if (!cur) return;
    if (cur.kind === 'confirm') cur.resolve(answer);
    else if (cur.kind === 'prompt') cur.resolve(answer ? text : null);
    else cur.resolve();
    ref.current?.close();
    setQueue((q) => q.slice(1));
  };

  return (
    <dialog ref={ref} className="help grain ask" onCancel={(e) => { e.preventDefault(); done(false); }}>
      {cur && (
        <form method="dialog" className="stack" onSubmit={(e) => { e.preventDefault(); done(true); }}>
          <h2 style={{ margin: 0 }}>{cur.title}</h2>
          {cur.body && <div className="muted">{cur.body}</div>}
          {cur.kind === 'prompt' && <input autoFocus value={text} onChange={(e) => setText(e.target.value)} />}
          <div className="row end">
            {cur.kind !== 'alert' && <button type="button" onClick={() => done(false)}>Cancel</button>}
            <button type="submit" className={cur.kind === 'confirm' && cur.danger ? 'primary danger-fill' : 'primary'} autoFocus={cur.kind !== 'prompt'}>
              {cur.kind === 'alert' ? 'OK' : cur.ok}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
