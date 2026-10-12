import { CalendarPlus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx.ts';
import { SNAP_OPTIONS } from '../lib/schedule.ts';
import { ALL_DAYS, DAY_SHORT, formatHour } from '../lib/time.ts';
import { useActions } from '../state/actions.ts';
import { setDetails, setSettings } from '../state/ops.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** A modal built on <dialog>: focus trapping, Escape and the backdrop come for free. */
function Dialog({ title, description, onClose, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // No close() on cleanup: unmounting removes it from the top layer anyway, and a
    // close event fired during StrictMode's double-mount would dismiss it at once.
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={cx('dialog', className)}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-head">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

export function Dialogs() {
  const { dialog, openDialog } = useUI();
  const close = () => openDialog(null);
  if (dialog === 'settings') return <SettingsDialog onClose={close} />;
  if (dialog === 'calendar') return <CalendarDialog onClose={close} />;
  if (dialog === 'shortcuts') return <ShortcutsDialog onClose={close} />;
  return null;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={cx(value === o.value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { schedule, workspace, edit } = useStore();
  const actions = useActions();
  const { settings } = schedule;
  const hours = Array.from({ length: 25 }, (_, h) => h);

  const toggleDay = (d: number) => {
    const days = settings.days.includes(d) ? settings.days.filter((x) => x !== d) : [...settings.days, d];
    if (days.length) edit(setSettings({ days: days.sort((a, b) => a - b) }));
  };

  return (
    <Dialog
      title="Schedule settings"
      description="Changes apply as you go and can be undone."
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <section className="settings-section">
        <h3>Details</h3>
        <label className="field">
          <span>Title</span>
          <input
            className="input"
            value={schedule.title}
            placeholder="Class Schedule"
            onChange={(e) => edit(setDetails({ title: e.target.value }), 'details:title')}
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Name</span>
            <input
              className="input"
              value={schedule.owner}
              placeholder="Your name"
              onChange={(e) => edit(setDetails({ owner: e.target.value }), 'details:owner')}
            />
          </label>
          <label className="field">
            <span>Term</span>
            <input
              className="input"
              value={schedule.term}
              placeholder="SY 2026–2027 · 1st Semester"
              onChange={(e) => edit(setDetails({ term: e.target.value }), 'details:term')}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Week view</h3>
        <div className="field">
          <span className="field-label">Days</span>
          <div className="day-chips" role="group" aria-label="Visible days">
            {ALL_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={settings.days.includes(d)}
                className={cx('chip', settings.days.includes(d) && 'is-on')}
                onClick={() => toggleDay(d)}
              >
                {DAY_SHORT[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="field-row">
          <label className="field">
            <span>From</span>
            <select
              className="input"
              value={settings.startHour}
              disabled={settings.fitToClasses}
              onChange={(e) => {
                const startHour = Number(e.target.value);
                edit(setSettings({ startHour, endHour: Math.max(settings.endHour, startHour + 1) }));
              }}
            >
              {hours.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {formatHour(h, settings.clock)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>To</span>
            <select
              className="input"
              value={settings.endHour}
              disabled={settings.fitToClasses}
              onChange={(e) => edit(setSettings({ endHour: Number(e.target.value) }))}
            >
              {hours.slice(settings.startHour + 1).map((h) => (
                <option key={h} value={h}>
                  {h === 24 ? 'Midnight' : formatHour(h, settings.clock)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="switch-row">
          <input
            type="checkbox"
            className="switch"
            checked={settings.fitToClasses}
            onChange={(e) => edit(setSettings({ fitToClasses: e.target.checked }))}
          />
          <span>
            <strong>Fit hours to classes</strong>
            <span className="muted">Trim the grid to just before the first class and after the last.</span>
          </span>
        </label>
        <div className="field-row">
          <div className="field">
            <span className="field-label">Snap while dragging</span>
            <Segmented
              label="Snap while dragging"
              value={settings.snap}
              options={SNAP_OPTIONS.map((n) => ({ value: n, label: `${n} min` }))}
              onChange={(snap) => edit(setSettings({ snap }))}
            />
          </div>
          <div className="field">
            <span className="field-label">Clock</span>
            <Segmented
              label="Clock"
              value={settings.clock}
              options={[
                { value: '12h', label: '12-hour' },
                { value: '24h', label: '24-hour' },
              ]}
              onChange={(clock) => edit(setSettings({ clock }))}
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Term dates</h3>
        <p className="muted">Used when exporting to a calendar app.</p>
        <div className="field-row">
          <label className="field">
            <span>First day of classes</span>
            <input
              type="date"
              className="input"
              value={schedule.termStart}
              onChange={(e) => edit(setDetails({ termStart: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Last day of classes</span>
            <input
              type="date"
              className="input"
              value={schedule.termEnd}
              min={schedule.termStart || undefined}
              onChange={(e) => edit(setDetails({ termEnd: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="settings-section settings-inline">
        <div>
          <h3>Delete this semester</h3>
          <p className="muted">
            {workspace.schedules.length > 1
              ? 'Removes it from this browser. You can undo right after.'
              : 'This is your only semester. Create another before deleting it.'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-danger-ghost"
          disabled={workspace.schedules.length <= 1}
          onClick={() => {
            onClose();
            actions.deleteSemester(schedule.id);
          }}
        >
          <Trash2 aria-hidden /> Delete semester
        </button>
      </section>
    </Dialog>
  );
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function CalendarDialog({ onClose }: { onClose: () => void }) {
  const { schedule, edit } = useStore();
  const actions = useActions();
  const [start, setStart] = useState(() => schedule.termStart || iso(new Date()));
  const [end, setEnd] = useState(() => {
    if (schedule.termEnd) return schedule.termEnd;
    const d = new Date();
    d.setDate(d.getDate() + 18 * 7);
    return iso(d);
  });
  const valid = Boolean(start && end && end >= start);

  const download = () => {
    if (!valid) return;
    if (start !== schedule.termStart || end !== schedule.termEnd) {
      edit(setDetails({ termStart: start, termEnd: end }));
    }
    if (actions.exportIcs({ termStart: start, termEnd: end })) onClose();
  };

  return (
    <Dialog
      title="Add to your calendar"
      description="Every meeting becomes a weekly repeating event between these dates. Open the file with Google Calendar, Apple Calendar or Outlook."
      onClose={onClose}
      className="is-narrow"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={download} disabled={!valid || !schedule.meetings.length}>
            <CalendarPlus aria-hidden /> Download .ics
          </button>
        </>
      }
    >
      <div className="field-row">
        <label className="field">
          <span>First day of classes</span>
          <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Last day of classes</span>
          <input type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {!valid && <p className="field-error">The last day has to be on or after the first.</p>}
      {!schedule.meetings.length && <p className="field-error">There are no classes to export yet.</p>}
    </Dialog>
  );
}

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

const SHORTCUTS: [string, string[][]][] = [
  [
    'Editing',
    [
      ['Drag on empty space', 'Add a class'],
      ['Drag a class', 'Move it (hold Alt to copy)'],
      ['Drag its top or bottom edge', 'Change the times'],
      [`${mod} Z`, 'Undo'],
      [`${mod} Shift Z`, 'Redo'],
      ['N', 'New course'],
    ],
  ],
  [
    'Selected class',
    [
      ['↑ ↓', 'Move earlier / later'],
      ['← →', 'Move to the previous / next day'],
      ['Shift ↑ ↓', 'Shorten / lengthen'],
      ['D', 'Copy to the next day'],
      ['Delete', 'Remove'],
      ['Esc', 'Close the editor'],
    ],
  ],
  [
    'View',
    [
      ['W / L / H', 'Week grid / list / history'],
      [',', 'Settings'],
      ['?', 'This list'],
    ],
  ],
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} className="is-narrow">
      {SHORTCUTS.map(([group, rows]) => (
        <section key={group} className="shortcut-group">
          <h3>{group}</h3>
          <dl>
            {rows.map(([keys, what]) => (
              <div key={keys} className="shortcut">
                <dt>
                  {keys.split(' / ').map((combo, i) => (
                    <span key={combo}>
                      {i > 0 && <span className="muted"> / </span>}
                      {combo.startsWith('Drag') ? combo : combo.split(' ').map((k) => <kbd key={k}>{k}</kbd>)}
                    </span>
                  ))}
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Dialog>
  );
}
