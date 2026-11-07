import { useRef, useState } from 'react';
import { exampleProject } from '../lib/example';
import { extractProjectFromPdf } from '../lib/pdf';
import { mergeProjects, parseProject, printedCount } from '../lib/project';
import { newProject, type Project } from '../lib/schema';
import { deleteLocal, loadLocal } from '../lib/storage';
import { Icon, PageHead, SheetArt } from './art';
import { alertDialog, confirmDialog } from './dialog';

export async function readProjectFile(file: File): Promise<Project> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || (bytes[0] === 0x25 && bytes[1] === 0x50);
  if (isPdf) {
    const text = await extractProjectFromPdf(bytes);
    if (!text) throw new Error('This PDF has no Tallyleaf project inside. Open a PDF that Tallyleaf generated for printing, not a scan of filled sheets (scans go in the Scan step).');
    return parseProject(text);
  }
  return parseProject(new TextDecoder().decode(bytes));
}

/** Combine a file with the copy already in this browser, newest form wins. */
export async function withLocalCopy(p: Project): Promise<{ project: Project; note?: string }> {
  const local = await loadLocal(p.id);
  if (!local) return { project: p };
  const [a, b] = local.updatedAt >= p.updatedAt ? [local, p] : [p, local];
  const { project, report } = mergeProjects(a, b, 'the opened file');
  const note = `This project was already in this browser, so the two copies were combined: ${report.addedResponses} participants and ${report.addedBatches} print batches added.` +
    (report.clashes.length ? ` IDs ${report.clashes.join(', ')} have different answers in the two copies; nothing was thrown away, and you can choose what to keep in Data.` : '') +
    (report.skippedDeleted.length ? ` ${report.skippedDeleted.length} participant(s) you had deleted stayed deleted.` : '');
  return { project, note };
}

export function Home({ onOpen, projects, onRemoved, onAbout }: { onOpen: (p: Project) => void; projects: Project[]; onRemoved: () => void; onAbout: () => void }) {
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const openFile = async (file: File) => {
    setError('');
    try {
      const { project, note } = await withLocalCopy(await readProjectFile(file));
      if (note) await alertDialog('Project combined', note);
      onOpen(project);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (p: Project) => {
    if (!(await confirmDialog(`Remove “${p.form.title}” from this browser?`, "This can't be undone here. Project files and PDFs you downloaded are not affected.", 'Remove', true))) return;
    await deleteLocal(p.id);
    onRemoved();
  };

  return (
    <div className="stack-lg">
      <PageHead
        title={<>Stop typing paper questionnaires into <em>SPSS.</em></>}
        lead={<>Build your questionnaire and print numbered copies. When they come back filled in, photograph the pile <b>in any order</b>. You get one row per participant with your column names, value labels and subscale scores. It runs in this browser, so <b>participant data never leaves your device</b>.</>}
        art={<SheetArt pins />}
      />
      <div className="cta">
        <button className="primary big" onClick={() => onOpen(newProject())}><Icon name="plus" />Start a questionnaire</button>
        <button onClick={() => fileRef.current?.click()}><Icon name="folder" />Open a project file</button>
        <button className="link" onClick={() => onOpen(exampleProject())}>or try the GAD-7 example</button>
        <input ref={fileRef} type="file" hidden accept=".tallyleaf,.psyform,.json,.pdf,application/json,application/pdf"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openFile(f); }} />
      </div>
      {error && <div className="note bad">{error}</div>}
      <p className="muted small" style={{ margin: 0 }}>New here? <button className="link" onClick={onAbout}>Read what Tallyleaf does and where the idea comes from</button>.</p>

      <ol className="callouts panel grain">
        <li><span className="pin">1</span><span><b>Corner squares</b> let a tilted phone photo be straightened.</span></li>
        <li><span className="pin">2</span><span><b>The code</b> says whose sheet and which page, so order never matters.</span></li>
        <li><span className="pin">3</span><span><b>The serial</b> becomes the participant ID in your data.</span></li>
        <li><span className="pin">4</span><span><b>Bubbles</b> are read as your scale values. Ticks and crosses work too.</span></li>
      </ol>

      {projects.length > 0 && (
        <section>
          <h2>Your projects</h2>
          <div className="project-cards">
            {projects.map((p) => (
              <div className="project-card panel grain" key={p.id}>
                <button className="project-open" onClick={() => onOpen(p)}>
                  <b>{p.form.title || 'Untitled'}</b>
                  <span className="mono">{printedCount(p)} printed · {p.responses.length} scanned</span>
                  <small>Edited {new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                </button>
                <button className="link danger" onClick={() => remove(p)}>Remove</button>
              </div>
            ))}
          </div>
          <p className="muted small">Browsers sometimes clear their storage, so keep the <code>.tallyleaf</code> file from <b>Save project file</b>. It holds participants' answers and pictures of their handwriting: store it like research data. Lost it? Any PDF Tallyleaf made for printing restores the questions and print history, but not scanned answers.</p>
        </section>
      )}
    </div>
  );
}
