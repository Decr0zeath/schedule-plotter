import { Check, Copy, MapPin, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { cx } from '../lib/cx.ts';
import { layoutDay } from '../lib/layout.ts';
import { SWATCHES, accentVar } from '../lib/palette.ts';
import { courseLabel, sortMeetings, uid } from '../lib/schedule.ts';
import {
  ALL_DAYS,
  DAY_LONG,
  MINUTES_PER_DAY,
  formatDuration,
  fromTimeInput,
  toTimeInput,
} from '../lib/time.ts';
import type { Meeting } from '../lib/types.ts';
import { useActions } from '../state/actions.ts';
import { addMeetings, updateCourse, updateMeeting } from '../state/ops.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';
import { AttendanceSection } from './AttendanceSection.tsx';

/** Side panel for a course and every one of its meetings. */
export function EditorPanel() {
  const { schedule, edit } = useStore();
  const ui = useUI();
  const actions = useActions();
  const { selection } = ui;
  const codeRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const selectedMeeting =
    selection?.kind === 'meeting' ? schedule.meetings.find((m) => m.id === selection.id) : undefined;
  const courseId = selection?.kind === 'course' ? selection.id : selectedMeeting?.courseId;
  const course = schedule.courses.find((c) => c.id === courseId);

  // Selection can go stale after undo or a semester switch.
  useEffect(() => {
    if (selection && !course) ui.select(null);
  }, [selection, course, ui]);

  useEffect(() => {
    if (selection?.kind === 'course' && selection.focus) codeRef.current?.focus();
  }, [selection]);

  useEffect(() => {
    if (!selectedMeeting) return;
    // Keep fields in place when changing selection by focusing another meeting row.
    const focusedRow = document.activeElement?.closest('.meeting-row');
    if (focusedRow && panelRef.current?.contains(focusedRow)) return;
    if (panelRef.current?.querySelector('.attendance-editor')) {
      panelRef.current.querySelector('.editor-body')?.scrollTo({ top: 0 });
    } else {
      panelRef.current
        ?.querySelector(`[data-row="${selectedMeeting.id}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedMeeting?.id, selection?.kind === 'meeting' ? selection.date : undefined]);

  if (!course) return null;

  const meetings = sortMeetings(schedule.meetings.filter((m) => m.courseId === course.id));
  const weekly = meetings.reduce((sum, m) => sum + m.end - m.start, 0);
  const conflicts = new Set(
    ALL_DAYS.flatMap((d) =>
      layoutDay(schedule.meetings.filter((m) => m.day === d))
        .filter((p) => p.conflict)
        .map((p) => p.meeting.id),
    ),
  );

  const setCourse = (field: 'code' | 'title' | 'notes', value: string) =>
    edit(updateCourse(course.id, { [field]: value }), `course:${course.id}:${field}`);

  const setTimes = (m: Meeting, field: 'start' | 'end', value: string) => {
    const minutes = fromTimeInput(value);
    if (minutes === null) return;
    const length = m.end - m.start;
    // Moving the start keeps the length; an end before the start drags the start along.
    const patch =
      field === 'start'
        ? { start: minutes, end: Math.min(MINUTES_PER_DAY, minutes + length) }
        : minutes > m.start
          ? { end: minutes }
          : { start: Math.max(0, minutes - length), end: minutes };
    if (patch.end !== undefined && patch.end <= (patch.start ?? m.start)) return;
    edit(updateMeeting(m.id, patch), `meeting:${m.id}:time`);
  };

  const addMeeting = () => {
    const days = schedule.settings.days;
    const last = meetings[meetings.length - 1];
    const meeting: Meeting = last
      ? { ...last, id: uid(), day: days.find((d) => d > last.day) ?? days[0] ?? last.day }
      : { id: uid(), courseId: course.id, day: days[0] ?? 1, start: 9 * 60, end: 10 * 60 + 30, room: '' };
    edit(addMeetings(meeting));
    ui.select({ kind: 'meeting', id: meeting.id });
  };

  return (
    <aside
      ref={panelRef}
      className="editor"
      style={{ '--accent': accentVar(course.color) } as CSSProperties}
      aria-label={`Edit ${courseLabel(course)}`}
    >
      <header className="editor-head">
        <div className="editor-heading">
          <span className="eyebrow">
            <span className="course-dot" aria-hidden /> Course
          </span>
          <h2>{courseLabel(course)}</h2>
          <span className="editor-sub">
            {meetings.length} meeting{meetings.length === 1 ? '' : 's'} · {formatDuration(weekly)} a week
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={() => ui.select(null)} aria-label="Close editor">
          <X />
        </button>
      </header>

      <div className="editor-body">
        {selectedMeeting && (
          <AttendanceSection
            meeting={selectedMeeting}
            date={selection?.kind === 'meeting' ? selection.date : undefined}
          />
        )}
        <div className="field-row">
          <label className="field field-code">
            <span>Code</span>
            <input
              ref={codeRef}
              className="input"
              value={course.code}
              placeholder="11055"
              onChange={(e) => setCourse('code', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input
              className="input"
              value={course.title}
              placeholder="Data Structures"
              onChange={(e) => setCourse('title', e.target.value)}
            />
          </label>
        </div>

        <fieldset className="field">
          <legend>Color</legend>
          <div className="swatches" role="radiogroup" aria-label="Color">
            {SWATCHES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={course.color === s.key}
                aria-label={s.label}
                title={s.label}
                className="swatch-btn"
                style={{ '--swatch': accentVar(s.key) } as CSSProperties}
                onClick={() => edit(updateCourse(course.id, { color: s.key }))}
              >
                {course.color === s.key && <Check aria-hidden />}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>Notes</span>
          <textarea
            className="input"
            rows={2}
            value={course.notes}
            placeholder="Section, instructor, links…"
            onChange={(e) => setCourse('notes', e.target.value)}
          />
        </label>

        <div className="editor-section">
          <h3>Meetings</h3>
          {meetings.length === 0 && (
            <p className="muted">No meetings yet. Add one here, or drag on the grid.</p>
          )}
          <ul className="meeting-list">
            {meetings.map((m) => (
              <li
                key={m.id}
                data-row={m.id}
                className={cx('meeting-row', selectedMeeting?.id === m.id && 'is-selected')}
                onPointerEnter={() => ui.setHoverMeeting(m.id)}
                onPointerLeave={() => ui.setHoverMeeting(null)}
                onFocus={() => {
                  if (selectedMeeting?.id !== m.id) ui.select({ kind: 'meeting', id: m.id });
                }}
              >
                <div className="meeting-when">
                  <select
                    className="input"
                    value={m.day}
                    aria-label="Day"
                    onChange={(e) => edit(updateMeeting(m.id, { day: Number(e.target.value) }))}
                  >
                    {ALL_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_LONG[d]}
                      </option>
                    ))}
                  </select>
                  <label className="input-icon">
                    <MapPin aria-hidden />
                    <input
                      className="input"
                      value={m.room}
                      placeholder="Room"
                      aria-label="Room"
                      onChange={(e) =>
                        edit(updateMeeting(m.id, { room: e.target.value }), `meeting:${m.id}:room`)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Copy to the next day"
                    aria-label="Copy to the next day"
                    onClick={() => actions.duplicateMeeting(m.id)}
                  >
                    <Copy />
                  </button>
                  <button
                    type="button"
                    className="icon-btn is-danger"
                    title="Remove meeting"
                    aria-label="Remove meeting"
                    onClick={() => actions.deleteMeeting(m.id)}
                  >
                    <Trash2 />
                  </button>
                </div>
                <div className="meeting-where">
                  <input
                    type="time"
                    className="input"
                    step={300}
                    value={toTimeInput(m.start)}
                    aria-label="Start time"
                    onChange={(e) => setTimes(m, 'start', e.target.value)}
                  />
                  <span className="dash" aria-hidden>
                    –
                  </span>
                  <input
                    type="time"
                    className="input"
                    step={300}
                    value={toTimeInput(m.end)}
                    aria-label="End time"
                    onChange={(e) => setTimes(m, 'end', e.target.value)}
                  />
                  <span className={cx('meeting-length', conflicts.has(m.id) && 'is-conflict')}>
                    {conflicts.has(m.id) ? 'Overlaps' : formatDuration(m.end - m.start)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary btn-block" onClick={addMeeting}>
            <Plus aria-hidden /> Add meeting
          </button>
        </div>
      </div>

      <footer className="editor-foot">
        <button type="button" className="btn btn-danger-ghost" onClick={() => actions.deleteCourse(course.id)}>
          <Trash2 aria-hidden /> Delete course
        </button>
        <button type="button" className="btn btn-primary" onClick={() => ui.select(null)}>
          Done
        </button>
      </footer>
    </aside>
  );
}
