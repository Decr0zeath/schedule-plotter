import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { activeSchedule } from '../lib/schedule.ts';
import {
  bootstrap,
  loadExportedSignature,
  saveExportedSignature,
  saveLocal,
  signature,
  type Boot,
} from '../lib/storage.ts';
import type { Schedule, Workspace } from '../lib/types.ts';
import { editActive, type ScheduleEdit } from './ops.ts';

type Update = (ws: Workspace) => Workspace;

interface History {
  past: Workspace[];
  present: Workspace;
  future: Workspace[];
  coalesceKey: string | null;
  coalesceAt: number;
}

type Action =
  | { type: 'commit'; update: Update; coalesce?: string; at: number }
  | { type: 'navigate'; update: Update }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 200;
/** Consecutive edits with the same key inside this window form one undo step (typing). */
const COALESCE_MS = 1200;

function reducer(state: History, action: Action): History {
  switch (action.type) {
    case 'commit': {
      const next = action.update(state.present);
      if (next === state.present) return state;
      if (
        action.coalesce &&
        action.coalesce === state.coalesceKey &&
        action.at - state.coalesceAt < COALESCE_MS
      ) {
        return { ...state, present: next, future: [], coalesceAt: action.at };
      }
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        coalesceKey: action.coalesce ?? null,
        coalesceAt: action.at,
      };
    }
    case 'navigate': {
      const next = action.update(state.present);
      return next === state.present ? state : { ...state, present: next };
    }
    case 'undo': {
      if (!state.past.length) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
        coalesceKey: null,
        coalesceAt: 0,
      };
    }
    case 'redo': {
      if (!state.future.length) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
        coalesceKey: null,
        coalesceAt: 0,
      };
    }
  }
}

/**
 * clean     – matches the published schedule.json
 * dirty     – local edits that are not in schedule.json yet
 * exported  – local edits exported as JSON but not deployed yet
 * local     – no schedule.json deployed; everything lives in this browser
 */
export type SyncState = 'clean' | 'dirty' | 'exported' | 'local';

export interface Store {
  workspace: Workspace;
  schedule: Schedule;
  /** Undoable change to the workspace. */
  commit: (update: Update, coalesce?: string) => void;
  /** Undoable change to the active schedule. */
  edit: (edit: ScheduleEdit, coalesce?: string) => void;
  /** Non-undoable change, e.g. switching semesters. */
  navigate: (update: Update) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  sync: SyncState;
  conflict: boolean;
  markExported: () => void;
  revertToPublished: () => void;
  keepLocal: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
}

export function StoreProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  useEffect(() => {
    void bootstrap().then(setBoot);
  }, []);
  return boot ? <LoadedStore boot={boot}>{children}</LoadedStore> : fallback;
}

function LoadedStore({ boot, children }: { boot: Boot; children: ReactNode }) {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: boot.workspace,
    future: [],
    coalesceKey: null,
    coalesceAt: 0,
  }));
  const [baseSig, setBaseSig] = useState(boot.baseSig);
  const [conflict, setConflict] = useState(boot.conflict);
  const [exportedSig, setExportedSig] = useState(loadExportedSignature);
  const present = history.present;

  // Persist (debounced), and flush when the page is hidden.
  const latest = useRef({ workspace: present, base: baseSig });
  latest.current = { workspace: present, base: baseSig };
  useEffect(() => {
    const t = setTimeout(() => saveLocal(latest.current), 250);
    return () => clearTimeout(t);
  }, [present, baseSig]);
  useEffect(() => {
    const flush = () => saveLocal(latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const commit = useCallback(
    (update: Update, coalesce?: string) => dispatch({ type: 'commit', update, coalesce, at: Date.now() }),
    [],
  );
  const edit = useCallback(
    (fn: ScheduleEdit, coalesce?: string) => commit((ws) => editActive(ws, fn), coalesce),
    [commit],
  );
  const navigate = useCallback((update: Update) => dispatch({ type: 'navigate', update }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  const sig = useMemo(() => signature(present), [present]);
  const sync: SyncState = !boot.publishedSig
    ? 'local'
    : sig === boot.publishedSig
      ? 'clean'
      : sig === exportedSig
        ? 'exported'
        : 'dirty';

  const markExported = useCallback(() => {
    saveExportedSignature(sig);
    setExportedSig(sig);
  }, [sig]);

  const resolveConflict = useCallback(() => {
    setConflict(false);
    setBaseSig(boot.publishedSig);
  }, [boot.publishedSig]);

  const revertToPublished = useCallback(() => {
    const published = boot.published;
    if (!published) return;
    commit((ws) => ({
      ...published,
      activeId: published.schedules.some((s) => s.id === ws.activeId) ? ws.activeId : published.activeId,
    }));
    resolveConflict();
  }, [boot.published, commit, resolveConflict]);

  const value = useMemo<Store>(
    () => ({
      workspace: present,
      schedule: activeSchedule(present),
      commit,
      edit,
      navigate,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      sync,
      conflict,
      markExported,
      revertToPublished,
      keepLocal: resolveConflict,
    }),
    [
      present,
      commit,
      edit,
      navigate,
      undo,
      redo,
      history.past.length,
      history.future.length,
      sync,
      conflict,
      markExported,
      revertToPublished,
      resolveConflict,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
