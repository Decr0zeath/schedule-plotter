import { fromLegacy, isLegacySchedule } from './legacy.ts';
import {
  ImportError,
  emptyWorkspace,
  isScheduleLike,
  isWorkspaceLike,
  normalizeSchedule,
  normalizeWorkspace,
} from './schedule.ts';
import type { Schedule, Workspace } from './types.ts';

const LOCAL_KEY = 'schedule-plotter:workspace';
const EXPORTED_KEY = 'schedule-plotter:exported';

/** A short content hash of the schedules (activeId is a view preference, not content). */
export function signature(ws: Workspace): string {
  const text = JSON.stringify(ws.schedules);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export type Imported =
  | { kind: 'workspace'; workspace: Workspace }
  | { kind: 'schedule'; schedule: Schedule; legacy: boolean };

/** Accepts a full workspace, a single schedule, or the original cell-map format. */
export function readImport(raw: unknown): Imported {
  if (isWorkspaceLike(raw)) return { kind: 'workspace', workspace: normalizeWorkspace(raw) };
  if (isScheduleLike(raw)) return { kind: 'schedule', schedule: normalizeSchedule(raw), legacy: false };
  if (isLegacySchedule(raw)) {
    return { kind: 'schedule', schedule: fromLegacy(raw, { term: 'Imported schedule' }), legacy: true };
  }
  throw new ImportError("This file doesn't look like a schedule.");
}

function asWorkspace(raw: unknown): Workspace {
  const imported = readImport(raw);
  if (imported.kind === 'workspace') return imported.workspace;
  const { schedule } = imported;
  return { app: 'schedule-plotter', version: 2, activeId: schedule.id, schedules: [schedule] };
}

/** The schedule.json deployed next to the app — the "published" version. */
export async function fetchPublished(): Promise<Workspace | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}schedule.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return asWorkspace(await res.json());
  } catch {
    return null;
  }
}

interface LocalCopy {
  workspace: Workspace;
  /** Signature of the published file this copy was last based on. */
  base: string | null;
}

export function loadLocal(): LocalCopy | null {
  try {
    const text = localStorage.getItem(LOCAL_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as { workspace?: unknown; base?: unknown };
    return {
      workspace: normalizeWorkspace(parsed.workspace),
      base: typeof parsed.base === 'string' ? parsed.base : null,
    };
  } catch {
    return null;
  }
}

export function saveLocal(copy: LocalCopy): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(copy));
  } catch {
    // Storage full or blocked (private mode): edits still live for this session.
  }
}

export function loadExportedSignature(): string | null {
  try {
    return localStorage.getItem(EXPORTED_KEY);
  } catch {
    return null;
  }
}

export function saveExportedSignature(sig: string): void {
  try {
    localStorage.setItem(EXPORTED_KEY, sig);
  } catch {
    // ignore
  }
}

export interface Boot {
  workspace: Workspace;
  published: Workspace | null;
  publishedSig: string | null;
  /** Signature the local copy is based on; differs from publishedSig while a conflict is unresolved. */
  baseSig: string | null;
  /** schedule.json changed since local edits were made. */
  conflict: boolean;
}

export async function bootstrap(): Promise<Boot> {
  const published = await fetchPublished();
  const local = loadLocal();
  const publishedSig = published ? signature(published) : null;

  if (!local) {
    return {
      workspace: published ?? emptyWorkspace(),
      published,
      publishedSig,
      baseSig: publishedSig,
      conflict: false,
    };
  }
  if (!published || local.base === publishedSig) {
    return { workspace: local.workspace, published, publishedSig, baseSig: publishedSig, conflict: false };
  }
  // The published file moved on. If nothing was edited locally, follow it.
  const untouched = signature(local.workspace) === local.base;
  if (untouched) {
    return {
      workspace: { ...published, activeId: pickActive(published, local.workspace.activeId) },
      published,
      publishedSig,
      baseSig: publishedSig,
      conflict: false,
    };
  }
  return { workspace: local.workspace, published, publishedSig, baseSig: local.base, conflict: true };
}

function pickActive(ws: Workspace, preferred: string): string {
  return ws.schedules.some((s) => s.id === preferred) ? preferred : ws.activeId;
}
