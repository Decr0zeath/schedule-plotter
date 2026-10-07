import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTheme } from '../hooks/useTheme.ts';

export type Selection =
  | { kind: 'meeting'; id: string }
  | { kind: 'course'; id: string; focus?: boolean }
  | null;

export type DialogName = 'settings' | 'calendar' | 'shortcuts' | null;
export type View = 'week' | 'list';

export interface ToastInput {
  message: string;
  tone?: 'default' | 'error';
  action?: { label: string; run: () => void };
}
export interface Toast extends ToastInput {
  id: number;
}

export interface UI {
  selection: Selection;
  select: (s: Selection) => void;
  hoverCourse: string | null;
  setHoverCourse: (id: string | null) => void;
  hoverMeeting: string | null;
  setHoverMeeting: (id: string | null) => void;
  dialog: DialogName;
  openDialog: (d: DialogName) => void;
  view: View;
  setView: (v: View) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toasts: Toast[];
  toast: (t: ToastInput) => void;
  dismissToast: (id: number) => void;
  theme: ReturnType<typeof useTheme>;
  /** Incremented to ask the poster host to render and download a PNG. */
  posterRequest: number;
  requestPoster: () => void;
}

const UIContext = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error('useUI outside UIProvider');
  return ui;
}

const VIEW_KEY = 'schedule-plotter:view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'week';
  } catch {
    return 'week';
  }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [selection, select] = useState<Selection>(null);
  const [hoverCourse, setHoverCourse] = useState<string | null>(null);
  const [hoverMeeting, setHoverMeeting] = useState<string | null>(null);
  const [dialog, openDialog] = useState<DialogName>(null);
  const [view, setViewState] = useState<View>(readView);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [posterRequest, setPosterRequest] = useState(0);
  const theme = useTheme();
  const nextId = useRef(1);

  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // per-viewer convenience only
    }
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
  }, []);
  const requestPoster = useCallback(() => setPosterRequest((n) => n + 1), []);

  const value = useMemo<UI>(
    () => ({
      selection,
      select,
      hoverCourse,
      setHoverCourse,
      hoverMeeting,
      setHoverMeeting,
      dialog,
      openDialog,
      view,
      setView,
      drawerOpen,
      setDrawerOpen,
      toasts,
      toast,
      dismissToast,
      theme,
      posterRequest,
      requestPoster,
    }),
    [
      selection,
      hoverCourse,
      hoverMeeting,
      dialog,
      view,
      setView,
      drawerOpen,
      toasts,
      toast,
      dismissToast,
      theme,
      posterRequest,
      requestPoster,
    ],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
