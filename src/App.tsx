import { useCallback, useEffect, useState } from 'react';
import { download, slug } from './lib/browser';
import type { Project } from './lib/schema';
import { lastOpen, loadLocal, saveLocal } from './lib/storage';
import { Builder } from './ui/Builder';
import { DataView } from './ui/Data';
import { Home } from './ui/Home';
import { Print } from './ui/Print';
import { Scan } from './ui/Scan';
import { Logo } from './ui/glyphs';
import { blockVars } from './lib/schema';

export type Update = (fn: (p: Project) => Project) => void;
type Tab = 'build' | 'print' | 'scan' | 'data';

function stepInfo(p: Project): Record<Tab, { label: string; note: string; done: boolean }> {
  const questions = p.form.blocks.reduce((n, b) => n + blockVars(b).length, 0);
  const printed = p.nextSerial - 1;
  const flags = p.responses.reduce((n, r) => n + Object.keys(r.flags).length, 0);
  return {
    build: { label: 'Build', note: `${questions} variable${questions === 1 ? '' : 's'}`, done: questions > 0 },
    print: { label: 'Print', note: printed ? `${printed} copies` : 'not yet', done: printed > 0 },
    scan: { label: 'Scan', note: p.responses.length ? `${p.responses.length} people` : 'not yet', done: p.responses.length > 0 },
    data: { label: 'Data', note: flags ? `${flags} to check` : p.responses.length ? 'all clear' : 'empty', done: p.responses.length > 0 && !flags },
  };
}
const TABS: Tab[] = ['build', 'print', 'scan', 'data'];

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('build');
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const id = lastOpen();
    (id ? loadLocal(id) : Promise.resolve(undefined))
      .then((p) => p && setProject(p))
      .catch(() => undefined)
      .finally(() => setBooted(true));
  }, []);

  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveLocal(project).catch(() => undefined), 400);
    return () => clearTimeout(t);
  }, [project]);

  const update: Update = useCallback((fn) => setProject((p) => (p ? { ...fn(p), updatedAt: new Date().toISOString() } : p)), []);

  const open = (p: Project, t: Tab = 'build') => {
    setProject(p);
    setTab(t);
    lastOpen(p.id);
    saveLocal(p).catch(() => undefined);
  };

  const close = () => {
    setProject(null);
    lastOpen(null);
  };

  const saveFile = () => {
    if (!project) return;
    const p = { ...project, lastFileSaveAt: new Date().toISOString() };
    download(JSON.stringify(p, null, 1), `${slug(p.form.title)}.psyform`, 'application/json');
    setProject(p);
  };

  const unsaved = !!project && (!project.lastFileSaveAt || project.updatedAt > project.lastFileSaveAt);

  if (!booted) return null;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={close} title="All projects">
          <Logo />
          PsychScan
        </button>
        {project && (
          <>
            <span className="project-title">{project.form.title || 'Untitled'}</span>
            <nav className="steps" role="tablist" aria-label="Steps">
              {TABS.map((k, i) => {
                const info = stepInfo(project)[k];
                return (
                  <button key={k} role="tab" className={`step ${info.done ? 'done' : ''}`} aria-selected={tab === k} onClick={() => setTab(k)}>
                    <span className="bub">{i + 1}</span>
                    <span className="lbl"><b>{info.label}</b><small>{info.note}</small></span>
                  </button>
                );
              })}
            </nav>
            <div className="actions">
              <button className="savebtn" onClick={saveFile} title="Download the .psyform project file. You need it to scan on another device or to keep editing.">
                {unsaved && <span className="unsaved" aria-label="Not saved to a file yet" />}
                Save project file
              </button>
            </div>
          </>
        )}
      </header>
      <main>
        {!project && <Home onOpen={open} />}
        {project && tab === 'build' && <Builder project={project} update={update} onNext={() => setTab('print')} />}
        {project && tab === 'print' && <Print project={project} update={update} saveFile={saveFile} />}
        {project && tab === 'scan' && <Scan project={project} update={update} onDone={() => setTab('data')} />}
        {project && tab === 'data' && <DataView project={project} update={update} />}
      </main>
      <footer className="site">
        <div>Free and open source (MIT). Your questions and your participants' answers stay in this browser tab; nothing is uploaded anywhere.</div>
        <span>PsychScan v0.1</span>
      </footer>
    </div>
  );
}
