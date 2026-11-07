import { useCallback, useEffect, useState } from 'react';
import { download, slug } from './lib/browser';
import type { Project } from './lib/schema';
import { lastOpen, loadLocal, saveLocal } from './lib/storage';
import { Builder } from './ui/Builder';
import { DataView } from './ui/Data';
import { Home } from './ui/Home';
import { Print } from './ui/Print';
import { Scan } from './ui/Scan';

export type Update = (fn: (p: Project) => Project) => void;
type Tab = 'build' | 'print' | 'scan' | 'data';

const TABS: [Tab, string][] = [['build', '1 · Build'], ['print', '2 · Print'], ['scan', '3 · Scan'], ['data', '4 · Data']];

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
          <svg className="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)" /><circle cx="11" cy="16" r="5" fill="var(--accent-ink)" /><circle cx="22" cy="16" r="4.5" fill="none" stroke="var(--accent-ink)" strokeWidth="2" /></svg>
          PsychScan
        </button>
        {project && (
          <>
            <span className="project-title">{project.form.title || 'Untitled'}</span>
            <nav className="tabs" role="tablist">
              {TABS.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
              ))}
            </nav>
            <div className="actions">
              <button onClick={saveFile} title="Download the project file. Keep it safe: you need it to scan and to edit on another device.">
                {unsaved && <span className="dot" aria-label="Changes not saved to a file" />}
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
        PsychScan is free and open source (MIT). Everything runs in your browser — questions and answers never leave your device.
      </footer>
    </div>
  );
}
