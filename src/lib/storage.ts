import { del, entries, get, set } from 'idb-keyval';
import type { Project } from './schema';

const KEY = (id: string) => `project:${id}`;

export const saveLocal = (p: Project) => set(KEY(p.id), p);
export const loadLocal = (id: string) => get<Project>(KEY(id));
export const deleteLocal = (id: string) => del(KEY(id));

export async function listLocal(): Promise<Project[]> {
  const all = await entries<string, Project>();
  return all
    .filter(([k]) => String(k).startsWith('project:'))
    .map(([, p]) => p)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function lastOpen(id?: string | null): string | null {
  try {
    if (id === undefined) return localStorage.getItem('psychscan:last');
    if (id === null) localStorage.removeItem('psychscan:last');
    else localStorage.setItem('psychscan:last', id);
  } catch {
    /* storage blocked */
  }
  return null;
}
