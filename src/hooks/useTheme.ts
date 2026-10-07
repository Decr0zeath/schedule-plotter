import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMediaQuery } from './useMediaQuery.ts';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'schedule-plotter:theme';

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // per-viewer convenience only
    }
  }, [mode]);

  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#0d0d0d' : '#f3f2ee');
  }, [resolved]);

  const cycle = useCallback(
    () => setMode((m) => (m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system')),
    [],
  );
  return useMemo(() => ({ mode, resolved, setMode, cycle }), [mode, resolved, cycle]);
}
