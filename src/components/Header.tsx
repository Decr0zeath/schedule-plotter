import {
  CalendarPlus,
  Check,
  ChevronDown,
  CopyPlus,
  Download,
  Ellipsis,
  FileJson,
  FileUp,
  History,
  Image,
  Keyboard,
  LayoutGrid,
  List,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Printer,
  Redo2,
  Settings2,
  Sun,
  Undo2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useDismiss } from '../hooks/useDismiss.ts';
import { cx } from '../lib/cx.ts';
import { useActions } from '../state/actions.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';
import { Logo } from './Logo.tsx';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu.tsx';

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export function Header() {
  const { schedule, workspace, undo, redo, canUndo, canRedo } = useStore();
  const ui = useUI();
  const actions = useActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const { theme } = ui;

  return (
    <header className="app-header">
      <button
        type="button"
        className="icon-btn drawer-toggle"
        aria-label="Show courses and stats"
        onClick={() => ui.setDrawerOpen(!ui.drawerOpen)}
      >
        <PanelLeft />
      </button>

      <Logo className="brand" />

      <div className="titles">
        <button
          type="button"
          className="title-btn"
          onClick={() => ui.openDialog('settings')}
          title="Rename or change details"
        >
          {schedule.owner && <span className="owner">{schedule.owner}</span>}
          <h1 className="title">{schedule.title || 'Class Schedule'}</h1>
        </button>
        <Menu
          label="Switch semester"
          align="start"
          buttonClassName="term-btn"
          button={
            <>
              <span className="term-text">{schedule.term || 'Untitled term'}</span>
              <ChevronDown aria-hidden />
            </>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Semesters</MenuLabel>
              {workspace.schedules.map((s) => (
                <MenuItem
                  key={s.id}
                  checked={s.id === schedule.id}
                  icon={s.id === schedule.id ? <Check /> : null}
                  hint={`${s.courses.length} course${s.courses.length === 1 ? '' : 's'}`}
                  onSelect={() => {
                    actions.switchSemester(s.id);
                    close();
                  }}
                >
                  {s.term || s.title || 'Untitled term'}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                icon={<Plus />}
                onSelect={() => {
                  close();
                  actions.newSemester();
                }}
              >
                New blank semester
              </MenuItem>
              <MenuItem
                icon={<CopyPlus />}
                onSelect={() => {
                  close();
                  actions.duplicateSemester();
                }}
              >
                Duplicate this semester
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      <div className="header-spacer" />

      <SyncPill />

      <div className="toolbar">
        <div className="btn-group">
          <button
            type="button"
            className="icon-btn"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            title={`Undo (${mod}+Z)`}
          >
            <Undo2 />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            title={`Redo (${mod}+Shift+Z)`}
          >
            <Redo2 />
          </button>
        </div>

        <div className="segmented view-toggle" role="radiogroup" aria-label="View">
          <button
            type="button"
            role="radio"
            aria-checked={ui.view === 'week'}
            className={cx(ui.view === 'week' && 'is-on')}
            onClick={() => ui.setView('week')}
            title="Week grid (W)"
            aria-label="Week"
          >
            <LayoutGrid aria-hidden /> <span>Week</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={ui.view === 'list'}
            className={cx(ui.view === 'list' && 'is-on')}
            onClick={() => ui.setView('list')}
            title="List (L)"
            aria-label="List"
          >
            <List aria-hidden /> <span>List</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={ui.view === 'history'}
            className={cx(ui.view === 'history' && 'is-on')}
            onClick={() => ui.setView('history')}
            title="History (H)"
            aria-label="History"
          >
            <History aria-hidden /> <span>History</span>
          </button>
        </div>

        <Menu
          label="Export"
          buttonClassName="btn btn-primary export-btn"
          button={
            <>
              <Download aria-hidden /> <span>Export</span>
            </>
          }
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Image />}
                hint="PNG"
                onSelect={() => {
                  close();
                  actions.exportPng();
                }}
              >
                Image for sharing
              </MenuItem>
              <MenuItem
                icon={<CalendarPlus />}
                hint=".ics"
                onSelect={() => {
                  close();
                  ui.openDialog('calendar');
                }}
              >
                Add to calendar app
              </MenuItem>
              <MenuItem
                icon={<Printer />}
                hint={`${mod}+P`}
                onSelect={() => {
                  close();
                  actions.print();
                }}
              >
                Print
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<FileJson />}
                hint="JSON"
                onSelect={() => {
                  close();
                  actions.exportJson();
                }}
              >
                schedule.json for the repo
              </MenuItem>
            </>
          )}
        </Menu>

        <Menu label="More" buttonClassName="icon-btn" title="More" button={<Ellipsis />}>
          {(close) => (
            <>
              <MenuItem
                icon={<FileUp />}
                onSelect={() => {
                  close();
                  fileRef.current?.click();
                }}
              >
                Import JSON…
              </MenuItem>
              <MenuItem
                icon={<Settings2 />}
                hint=","
                onSelect={() => {
                  close();
                  ui.openDialog('settings');
                }}
              >
                Schedule settings
              </MenuItem>
              <MenuItem
                icon={<Keyboard />}
                hint="?"
                onSelect={() => {
                  close();
                  ui.openDialog('shortcuts');
                }}
              >
                Keyboard shortcuts
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Theme</MenuLabel>
              {(
                [
                  ['system', 'Match system', <Monitor key="m" />],
                  ['light', 'Light', <Sun key="s" />],
                  ['dark', 'Dark', <Moon key="d" />],
                ] as const
              ).map(([mode, label, icon]) => (
                <MenuItem key={mode} icon={icon} checked={theme.mode === mode} onSelect={() => theme.setMode(mode)}>
                  {label}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void actions.importFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}

function SyncPill() {
  const { sync, conflict, revertToPublished, keepLocal } = useStore();
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss([ref], () => setOpen(false), open);
  const close = () => setOpen(false);

  const state = conflict ? 'conflict' : sync;
  const label = {
    clean: 'Published',
    dirty: 'Unpublished edits',
    exported: 'Exported',
    local: 'Saved in browser',
    conflict: 'Newer version published',
  }[state];

  return (
    <div className="menu-root sync" ref={ref}>
      <button
        type="button"
        className={cx('sync-pill', `is-${state}`)}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {state === 'clean' ? <Check aria-hidden /> : <span className="sync-dot" aria-hidden />}
        <span>{label}</span>
      </button>
      {open && (
        <div className="popover sync-pop is-end" role="dialog" aria-label="Publishing">
          {state === 'conflict' && (
            <p>
              <code>schedule.json</code> was updated since you last edited in this browser. Load it, or keep
              your edits and publish them over it later.
            </p>
          )}
          {state === 'clean' && (
            <p>This matches the <code>schedule.json</code> deployed with the site. Edits you make are kept in this browser until you publish them.</p>
          )}
          {state === 'dirty' && (
            <p>Your edits are saved in this browser. To publish them, export <code>schedule.json</code> and commit it to the repo.</p>
          )}
          {state === 'exported' && (
            <p>You exported these edits. Commit the downloaded <code>schedule.json</code> to the repo to publish them.</p>
          )}
          {state === 'local' && (
            <p>No <code>schedule.json</code> is deployed next to the app, so your schedules live in this browser. Export them to keep a copy.</p>
          )}
          <div className="sync-actions">
            {state === 'conflict' ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    revertToPublished();
                    close();
                  }}
                >
                  Load published
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    keepLocal();
                    close();
                  }}
                >
                  Keep my edits
                </button>
              </>
            ) : (
              <>
                {state !== 'clean' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      actions.exportJson();
                      close();
                    }}
                  >
                    <FileJson aria-hidden /> Export schedule.json
                  </button>
                )}
                {(state === 'dirty' || state === 'exported') && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      revertToPublished();
                      close();
                    }}
                  >
                    Revert to published
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
