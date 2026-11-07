import { useEffect, useRef, useState } from 'react';
import { download, slug } from '../lib/browser';
import { GFORM_STEPS, googleFormScript } from '../lib/gform';
import type { FormDef } from '../lib/schema';
import { Icon } from './art';

/** Explains, step by step, how to turn the questionnaire into a Google Form with a generated script. */
export function GoogleFormDialog({ form, open, onClose }: { form: FormDef; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const script = open ? googleFormScript(form) : '';

  useEffect(() => {
    if (open && !ref.current?.open) { setCopied(false); ref.current?.showModal(); }
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
    } catch {
      setCopied(false);
      download(script, `${slug(form.title)}-google-form.gs`, 'text/plain');
    }
  };

  return (
    <dialog ref={ref} className="help grain gform" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="row"><h2 className="grow" style={{ margin: 0 }}>Make a <em>Google Form</em> version</h2><button className="icon-btn ghost" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
      <p className="muted">
        Google Forms can't import files, so Tallyleaf gives you a small script that builds the form for you in your own Google account.
        Handy for participants who answer online while others fill in paper copies.
      </p>
      <div className="row">
        <button className="primary" onClick={copy}><Icon name={copied ? 'check' : 'save'} />{copied ? 'Script copied' : '1. Copy the script'}</button>
        <button onClick={() => download(script, `${slug(form.title)}-google-form.gs`, 'text/plain')}>or download it (.gs)</button>
        <a className="btn" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">2. Open Google Apps Script ↗</a>
      </div>
      <ol className="help-steps">
        {GFORM_STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="note info small">
        Rating scales become multiple-choice grids. Google saves answers as words (“Agree”), not numbers; the script's comments list Tallyleaf's numbers so you can recode the responses sheet the same way as your paper data. Running the script twice makes two forms.
      </div>
    </dialog>
  );
}
