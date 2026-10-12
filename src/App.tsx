import { FileDown } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { AgendaView } from './components/AgendaView.tsx';
import { Dialogs } from './components/Dialogs.tsx';
import { EditorPanel } from './components/EditorPanel.tsx';
import { Header } from './components/Header.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { Logo } from './components/Logo.tsx';
import { PosterHost } from './components/Poster.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Toasts } from './components/Toasts.tsx';
import { WeekGrid } from './components/WeekGrid.tsx';
import { useMediaQuery } from './hooks/useMediaQuery.ts';
import { useNow } from './hooks/useNow.ts';
import { cx } from './lib/cx.ts';
import { DAY_SHORT, MINUTES_PER_DAY, clamp, formatDuration, isoWeekday } from './lib/time.ts';
import { useActions } from './state/actions.ts';
import { AttendanceProvider } from './state/attendance.tsx';
import { updateMeeting } from './state/ops.ts';
import { StoreProvider, useStore } from './state/store.tsx';
import { UIProvider, useUI } from './state/ui.tsx';

export function App() {
  return (
    <UIProvider>
      <StoreProvider fallback={<Splash />}>
        <AttendanceProvider>
          <Shell />
        </AttendanceProvider>
      </StoreProvider>
    </UIProvider>
  );
}

function Splash() {
  return (
    <div className="splash" aria-busy="true" aria-label="Loading schedule">
      <Logo className="splash-logo" />
    </div>
  );
}

function Shell() {
  const { schedule } = useStore();
  const ui = useUI();
  const isPhone = useMediaQuery('(max-width: 720px)');
  const dropping = useFileDrop();
  useShortcuts();

  const visible = schedule.settings.days;
  const today = isoWeekday(useNow());
  const [phoneDay, setPhoneDay] = useState(today);
  const day = visible.includes(phoneDay) ? phoneDay : visible[0];
  const step = (direction: 1 | -1) => {
    const i = visible.indexOf(day);
    setPhoneDay(visible[clamp(i + direction, 0, visible.length - 1)]);
  };

  return (
    <div
      className={cx('app', ui.selection && 'has-editor', ui.drawerOpen && 'drawer-open')}
      style={{ '--days': visible.length } as CSSProperties}
    >
      <Header />
      <div className="app-body">
        <aside className="sidebar" aria-label="Courses and stats">
          <Sidebar />
        </aside>
        <main className="main">
          {isPhone && ui.view === 'week' && <DayPager day={day} onChange={setPhoneDay} />}
          {ui.view === 'week' ? (
            <WeekGrid days={isPhone ? [day] : visible} onSwipe={isPhone ? step : undefined} />
          ) : ui.view === 'history' ? (
            <HistoryView />
          ) : (
            <AgendaView />
          )}
        </main>
        <EditorPanel />
      </div>
      <div
        className="scrim"
        aria-hidden
        // pointerdown, not click: the click synthesized after a tap that opens the
        // editor would otherwise land on the freshly shown scrim and close it again.
        onPointerDown={() => {
          ui.setDrawerOpen(false);
          if (isPhone || window.innerWidth < 1280) ui.select(null);
        }}
      />
      <Dialogs />
      <Toasts />
      <PosterHost />
      {dropping && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-card">
            <FileDown />
            <strong>Drop to import</strong>
            <span>schedule.json from this app or the old plotter</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DayPager({ day, onChange }: { day: number; onChange: (d: number) => void }) {
  const { schedule } = useStore();
  const today = isoWeekday(useNow());
  const totals = new Map<number, number>();
  for (const m of schedule.meetings) totals.set(m.day, (totals.get(m.day) ?? 0) + m.end - m.start);
  return (
    <nav className="day-pager" aria-label="Day">
      {schedule.settings.days.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={d === day}
          className={cx('day-pill', d === day && 'is-on', d === today && 'is-today')}
          onClick={() => onChange(d)}
        >
          <span>{DAY_SHORT[d]}</span>
          <small>{totals.get(d) ? formatDuration(totals.get(d)!) : '—'}</small>
        </button>
      ))}
    </nav>
  );
}

function useShortcuts() {
  const { schedule, edit, undo, redo } = useStore();
  const ui = useUI();
  const actions = useActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = Boolean(target.closest?.('input, textarea, select, [contenteditable="true"]'));
      const modKey = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (modKey && (key === 'z' || key === 'y')) {
        if (typing) return; // leave text undo to the browser
        e.preventDefault();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing || modKey || e.altKey) return;
      if (document.querySelector('dialog[open], .quick-add, [role="menu"]')) return;

      const meeting =
        ui.selection?.kind === 'meeting' ? schedule.meetings.find((m) => m.id === ui.selection!.id) : undefined;
      const { snap, days } = schedule.settings;

      if (meeting) {
        const nudge = (patch: { day?: number; start?: number; end?: number }) => {
          e.preventDefault();
          edit(updateMeeting(meeting.id, patch), `keys:${meeting.id}`);
        };
        const length = meeting.end - meeting.start;
        switch (e.key) {
          case 'ArrowUp':
            if (e.shiftKey) return nudge({ end: Math.max(meeting.start + snap, meeting.end - snap) });
            return nudge({ start: Math.max(0, meeting.start - snap), end: Math.max(length, meeting.end - snap) });
          case 'ArrowDown':
            if (e.shiftKey) return nudge({ end: Math.min(MINUTES_PER_DAY, meeting.end + snap) });
            return nudge({
              start: Math.min(MINUTES_PER_DAY - length, meeting.start + snap),
              end: Math.min(MINUTES_PER_DAY, meeting.end + snap),
            });
          case 'ArrowLeft':
          case 'ArrowRight': {
            const i = days.indexOf(meeting.day);
            const next = days[clamp(i + (e.key === 'ArrowLeft' ? -1 : 1), 0, days.length - 1)];
            return next === undefined || next === meeting.day ? undefined : nudge({ day: next });
          }
          case 'Delete':
          case 'Backspace':
            e.preventDefault();
            return actions.deleteMeeting(meeting.id);
          case 'd':
            e.preventDefault();
            return actions.duplicateMeeting(meeting.id);
        }
      }

      switch (e.key) {
        case 'Escape':
          if (ui.selection) ui.select(null);
          else if (ui.drawerOpen) ui.setDrawerOpen(false);
          return;
        case 'n':
          e.preventDefault();
          return actions.newCourse();
        case 'w':
          return ui.setView('week');
        case 'l':
          return ui.setView('list');
        case 'h':
          return ui.setView('history');
        case ',':
          return ui.openDialog('settings');
        case '?':
          return ui.openDialog('shortcuts');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [schedule, edit, undo, redo, ui, actions]);
}

/** Lets a JSON file be dropped anywhere on the page. */
function useFileDrop(): boolean {
  const actions = useActions();
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'));
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => /json$/i.test(f.type) || /\.json$/i.test(f.name));
      if (file) void actions.importFile(file);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [actions]);
  return dropping;
}
