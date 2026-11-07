import { useCallback, useEffect, useRef, useState } from 'react';
import { download, slug } from './lib/browser';
import { printedCount } from './lib/project';
import { scanQueue } from './lib/scanQueue';
import { blockVars, newProject, type Project } from './lib/schema';
import { lastOpen, listLocal, loadLocal, saveLocal } from './lib/storage';
import { Icon, Sprig, type IconName } from './ui/art';
import { About, Heart, SOCIALS } from './ui/About';
import { Builder } from './ui/Builder';
import { DataView } from './ui/Data';
import { Home } from './ui/Home';
import { Print } from './ui/Print';
import { Scan } from './ui/Scan';
import { DialogHost, promptDialog } from './ui/dialog';

export type Update = (fn: (p: Project) => Project) => void;
export type Tab = 'build' | 'print' | 'scan' | 'data';

const STEPS: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: 'build', label: 'Build', icon: 'build' },
  { tab: 'print', label: 'Print', icon: 'print' },
  { tab: 'scan', label: 'Scan', icon: 'scan' },
  { tab: 'data', label: 'Data', icon: 'data' },
];

function stepNotes(p: Project): Record<Tab, { note: string; done: boolean }> {
  const vars = p.form.blocks.reduce((n, b) => n + blockVars(b).length, 0);
  const printed = printedCount(p);
  const flags = p.responses.reduce((n, r) => n + Object.keys(r.flags).length, 0);
  return {
    build: { note: `${vars} column${vars === 1 ? '' : 's'}`, done: vars > 0 },
    print: { note: printed ? `${printed} copies` : 'not yet', done: printed > 0 },
    scan: { note: p.responses.length ? `${p.responses.length} people` : 'not yet', done: p.responses.length > 0 },
    data: { note: flags ? `${flags} to check` : p.responses.length ? 'all clear' : 'empty', done: p.responses.length > 0 && !flags },
  };
}

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('build');
  const [booted, setBooted] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const [saveError, setSaveError] = useState('');
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  useEffect(() => {
    scanQueue.connect({ get: () => projectRef.current, set: (p) => { projectRef.current = p; setProject(p); } });
    // ask the browser not to clear our storage (iOS Safari otherwise may after 7 days without a visit)
    navigator.storage?.persist?.().catch(() => undefined);
    // save at once when the tab is hidden or closed, instead of waiting for the autosave delay
    const flush = () => { if (projectRef.current) saveLocal(projectRef.current).catch(() => undefined); };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); };
  }, []);
  const help = useRef<HTMLDialogElement>(null);

  const refreshList = useCallback(() => listLocal().then(setProjects).catch(() => setProjects([])), []);

  useEffect(() => {
    const id = lastOpen();
    (id ? loadLocal(id) : Promise.resolve(undefined))
      .then((p) => p && setProject(p))
      .catch(() => undefined)
      .finally(() => { setBooted(true); refreshList(); });
  }, [refreshList]);

  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveLocal(project)
      .then(() => { setSaveError(''); refreshList(); })
      .catch((e) => setSaveError(`This browser couldn't save your latest changes (${(e as Error).message || 'storage full or blocked'}). Download the project file now so nothing is lost.`)), 400);
    return () => clearTimeout(t);
  }, [project, refreshList]);

  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [tab, project?.id, about]);

  const update: Update = useCallback((fn) => setProject((p) => (p ? { ...fn(p), updatedAt: new Date().toISOString() } : p)), []);

  const open = (p: Project, t: Tab = 'build') => {
    setAbout(false);
    setProject(p);
    setTab(t);
    lastOpen(p.id);
    saveLocal(p).then(refreshList).catch(() => undefined);
  };

  const goHome = () => {
    setAbout(false);
    setProject(null);
    lastOpen(null);
    refreshList();
  };

  const saveFile = () => {
    if (!project) return;
    const p = { ...project, lastFileSaveAt: new Date().toISOString() };
    download(JSON.stringify(p, null, 1), `${slug(p.form.title)}.tallyleaf`, 'application/json');
    setProject(p);
  };

  const rename = async () => {
    if (!project) return;
    setMenu(false);
    const t = await promptDialog('Rename questionnaire', project.form.title);
    if (t !== null && t.trim()) update((p) => ({ ...p, form: { ...p.form, title: t.trim() } }));
  };

  if (!booted) return null;
  const notes = project ? stepNotes(project) : null;
  const unsaved = !!project && (!project.lastFileSaveAt || project.updatedAt > project.lastFileSaveAt);
  const go = (t: Tab) => { if (project) { setAbout(false); setTab(t); } };
  const showAbout = () => { setAbout(true); setMenu(false); };

  return (
    <div className="shell">
      <aside className="sidebar grain">
        <button className="brand" onClick={goHome}>Tallyleaf<small>paper-to-data research tool</small></button>
        <nav className="side-nav" aria-label="Main">
          <button className={!project && !about ? 'on' : ''} onClick={goHome}><Icon name="home" />Home</button>
          {STEPS.map((s) => (
            <button key={s.tab} className={project && !about && tab === s.tab ? 'on' : ''} disabled={!project} onClick={() => go(s.tab)}>
              <Icon name={s.icon} />{s.label}
              {notes && <small>{notes[s.tab].note}</small>}
            </button>
          ))}
        </nav>
        <div className="side-projects">
          <div className="side-label">Projects</div>
          {projects.slice(0, 6).map((p) => (
            <button key={p.id} className={`side-project ${project?.id === p.id ? 'on' : ''}`} onClick={() => open(p, project?.id === p.id ? tab : 'build')}>
              <span className="dot" />
              <span><b>{p.form.title || 'Untitled'}</b><small>{printedCount(p)} printed · {p.responses.length} scanned</small></span>
            </button>
          ))}
          <button className="side-new" onClick={() => open(newProject())}><Icon name="plus" size={16} />New project</button>
        </div>
        <Sprig />
        <div className="side-foot">
          {project && <button onClick={saveFile}><Icon name="save" />Save project file{unsaved && <span className="unsaved" aria-label="not saved yet" />}</button>}
          <button className={about ? 'on' : ''} onClick={showAbout}><Icon name="info" />About</button>
          <button onClick={() => help.current?.showModal()}><Icon name="help" />Help</button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="brand mobile-only" onClick={goHome}>Tallyleaf</button>
          {project && !about ? (
            <>
              <div className="title-menu">
                <button className="title-btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                  <span>{project.form.title || 'Untitled'}</span><Icon name="chev" size={18} />
                </button>
                {menu && (
                  <div className="menu grain" role="menu">
                    <button role="menuitem" onClick={rename}>Rename</button>
                    <button role="menuitem" onClick={() => { saveFile(); setMenu(false); }}>Save project file{unsaved ? ' (unsaved changes)' : ''}</button>
                    <button role="menuitem" onClick={goHome}>Close and go home</button>
                  </div>
                )}
              </div>
              <ol className="stepper" aria-label="Progress">
                {STEPS.map((s, i) => (
                  <li key={s.tab} className={`${tab === s.tab ? 'on' : ''} ${notes![s.tab].done ? 'done' : ''}`}>
                    <button onClick={() => go(s.tab)} aria-current={tab === s.tab ? 'step' : undefined}>
                      <span className="num">{i + 1}</span><span className="lbl">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <button className="icon-btn mobile-only" onClick={saveFile} aria-label="Save project file">
                <Icon name="save" />{unsaved && <span className="unsaved" />}
              </button>
            </>
          ) : (
            <>
              <span className="top-note">{about ? 'About' : 'Paper questionnaires → spreadsheet'}</span>
              <button className="icon-btn mobile-only" onClick={showAbout} aria-label="About Tallyleaf"><Icon name="info" /></button>
            </>
          )}
        </header>

        <main>
          {saveError && project && (
            <div className="note bad save-banner" role="alert">{saveError} <button className="small primary" onClick={saveFile}>Download project file</button></div>
          )}
          {about && <About />}
          {!about && !project && <Home onOpen={open} projects={projects} onRemoved={refreshList} onAbout={showAbout} />}
          {!about && project && tab === 'build' && <Builder project={project} update={update} onNext={() => setTab('print')} />}
          {!about && project && tab === 'print' && <Print project={project} update={update} saveFile={saveFile} />}
          {!about && project && tab === 'scan' && <Scan project={project} update={update} onDone={() => setTab('data')} saveFile={saveFile} />}
          {!about && project && tab === 'data' && <DataView project={project} update={update} />}
        </main>
        <footer className="site grain">
          <div className="made">Made with <Heart /> by <b>Deepanshu Tomar</b></div>
          <nav className="foot-links" aria-label="Follow">
            {SOCIALS.map((s) => <a key={s.label} href={s.href} target="_blank" rel="noreferrer">{s.label}</a>)}
            <button className="link" onClick={showAbout}>About Tallyleaf</button>
          </nav>
          <small>Tallyleaf v0.1 · free and open source (MIT) · nothing you enter leaves this browser</small>
        </footer>
      </div>

      <nav className="tabbar grain" aria-label="Main">
        <button className={!project && !about ? 'on' : ''} onClick={goHome}><Icon name="home" /><span>Home</span></button>
        {STEPS.map((s) => (
          <button key={s.tab} className={project && !about && tab === s.tab ? 'on' : ''} disabled={!project} onClick={() => go(s.tab)}>
            <Icon name={s.icon} /><span>{s.label}</span>
          </button>
        ))}
      </nav>

      <DialogHost />
      <dialog ref={help} className="help grain" onClick={(e) => e.target === help.current && help.current.close()}>
        <div className="row"><h2 className="grow" style={{ margin: 0 }}>How Tallyleaf works</h2><button className="icon-btn" aria-label="Close" onClick={() => help.current?.close()}><Icon name="x" /></button></div>
        <ol className="help-steps">
          <li><b>Build.</b> Add questions in the order they appear on paper. Give each a column name (e.g. <code>gad1</code>) and the number each option is stored as.</li>
          <li><b>Print.</b> Download numbered copies. Each copy's serial is the participant ID. Print more later and the serials continue.</li>
          <li><b>Scan.</b> Photograph or scan the filled sheets, in any order. The code on each page files it under the right participant and page.</li>
          <li><b>Data.</b> Check the highlighted answers, then download Excel, CSV, a codebook or SPSS syntax.</li>
        </ol>
        <p className="muted">Keep the <code>.tallyleaf</code> project file (top menu → Save project file). Anyone with it can scan the sheets on another device. It contains participants' answers and pictures of their handwriting, so store and share it like any research data. Every PDF you generate carries a copy of the questions and print history (not the answers).</p>
      </dialog>
    </div>
  );
}
