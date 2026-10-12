import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { normalizeAttendance, type AttendanceLog } from '../lib/attendance.ts';

const STORAGE_KEY = 'schedule-plotter:attendance';

function loadAttendance(): AttendanceLog {
  try {
    return normalizeAttendance(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeAttendance(null);
  }
}

function saveAttendance(log: AttendanceLog) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage may be unavailable or full; keep the in-memory log usable.
  }
}

interface AttendanceState {
  log: AttendanceLog;
  byId: ReadonlyMap<string, AttendanceLog['entries'][number]>;
  /** Applies a pure operation immediately and returns the prior log for toast Undo. */
  update: (operation: (log: AttendanceLog) => AttendanceLog) => AttendanceLog;
}

const AttendanceContext = createContext<AttendanceState | null>(null);

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState(loadAttendance);
  const latest = useRef(log);
  const hasChanges = useRef(false);
  const requestedPersistence = useRef(log.entries.length > 0);
  const update = useCallback((operation: (log: AttendanceLog) => AttendanceLog) => {
    const previous = latest.current;
    const next = operation(previous);
    if (next === previous) return previous;
    hasChanges.current = true;
    latest.current = next;
    setLog(next);
    if (next.entries.length && !requestedPersistence.current) {
      requestedPersistence.current = true;
      try {
        void navigator.storage?.persist?.().catch(() => {});
      } catch {
        // Persistence is an optional browser capability.
      }
    }
    return previous;
  }, []);

  useEffect(() => {
    if (!hasChanges.current) return;
    const timer = setTimeout(() => saveAttendance(latest.current), 250);
    return () => clearTimeout(timer);
  }, [log]);
  useEffect(() => {
    const flush = () => {
      if (hasChanges.current) saveAttendance(latest.current);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const byId = useMemo(() => new Map(log.entries.map((entry) => [entry.id, entry])), [log]);
  const value = useMemo(() => ({ log, byId, update }), [log, byId, update]);
  return <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>;
}

export function useAttendance(): AttendanceState {
  const state = useContext(AttendanceContext);
  if (!state) throw new Error('useAttendance outside AttendanceProvider');
  return state;
}
