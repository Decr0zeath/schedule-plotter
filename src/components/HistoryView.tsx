import { CalendarOff, Trash2 } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { useNow } from '../hooks/useNow.ts';
import {
  ATTENDANCE_STATUSES,
  occurrences,
  summarizeAttendance,
  type AttendanceOccurrence,
} from '../lib/attendance.ts';
import { cx } from '../lib/cx.ts';
import { accentVar } from '../lib/palette.ts';
import { courseLabel } from '../lib/schedule.ts';
import { formatDate, formatRange, isoWeekday, localIsoDate, parseIsoDate } from '../lib/time.ts';
import { useAttendanceActions } from '../state/actions.ts';
import { useAttendance } from '../state/attendance.tsx';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';
import { AttendanceArrival, AttendanceStatus } from './AttendanceStatus.tsx';

export function HistoryView() {
  const { schedule } = useStore();
  const { log } = useAttendance();
  const ui = useUI();
  const actions = useAttendanceActions();
  const now = useNow();
  const today = localIsoDate(now);
  const [markingDay, setMarkingDay] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const items = useMemo(() => occurrences(schedule, log, now), [schedule, log, now]);
  const summary = useMemo(() => summarizeAttendance(items), [items]);
  const courses = useMemo(() => new Map(schedule.courses.map((c) => [c.id, c])), [schedule.courses]);
  const groups = useMemo(() => {
    const days = new Map<string, AttendanceOccurrence[]>();
    for (const item of items) {
      const rows = days.get(item.date) ?? [];
      rows.push(item);
      days.set(item.date, rows);
    }
    return [...days];
  }, [items]);
  const parsedDate = parseIsoDate(date);
  const dayCount = parsedDate ? schedule.meetings.filter((m) => m.day === isoWeekday(parsedDate)).length : 0;
  const dayDescription = dayCount
    ? `${dayCount} class${dayCount === 1 ? '' : 'es'} on ${formatDate(date)}. `
      + 'Existing entries for this day will be replaced.'
    : 'No classes are scheduled on this weekday.';

  return (
    <section className="history" aria-label="Attendance history">
      <section className="attendance-summary" aria-labelledby="attendance-summary-title">
        <div className="attendance-heading">
          <h2 id="attendance-summary-title">Attendance history</h2>
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={markingDay}
            aria-controls="mark-day-form"
            onClick={() => {
              setDate(today);
              setMarkingDay(!markingDay);
            }}
          >
            <CalendarOff aria-hidden /> Mark a day as no class
          </button>
        </div>
        <div className="attendance-stats">
          {ATTENDANCE_STATUSES.map((status) => (
            <div className="stat" key={status}>
              <span className="stat-value">{summary.counts[status]}</span>
              <AttendanceStatus status={status} />
              {status === 'late' && (
                <small className="muted">{summary.totalMinutesLate} min late total</small>
              )}
            </div>
          ))}
          <div className="stat">
            <span className="stat-value">{summary.notLogged}</span>
            <AttendanceStatus />
          </div>
        </div>
        {!schedule.termStart && (
          <p className="muted history-term-hint">
            Showing classes since your first log.{' '}
            <button type="button" className="text-btn" onClick={() => ui.openDialog('settings')}>
              Set term dates
            </button>{' '}
            to list the whole term.
          </p>
        )}
        {markingDay && (
          <form
            id="mark-day-form"
            className="mark-day-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!dayCount) return;
              actions.markDay(date, note);
              setMarkingDay(false);
              setNote('');
            }}
          >
            <label className="field">
              <span>Date</span>
              <input
                autoFocus
                className="input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Note</span>
              <input
                className="input"
                placeholder="What happened? Optional"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p id="mark-day-count" className="muted">
              {parsedDate ? dayDescription : 'Choose a valid date.'}
            </p>
            <div className="attendance-form-actions">
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={!dayCount}
                aria-describedby="mark-day-count"
              >
                Mark as no class
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setMarkingDay(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      {!items.length && (
        <p className="muted history-empty">
          {schedule.meetings.length
            ? 'No classes to list yet. Classes appear here once they start.'
            : 'No meetings or attendance entries for this semester yet.'}
        </p>
      )}
      {groups.map(([day, rows]) => (
        <section key={day} className="history-day" aria-label={formatDate(day, 'long')}>
          <header className="agenda-head">
            <h2>{formatDate(day, 'long')}</h2>
            {day === today && <span className="today-pill">Today</span>}
          </header>
          <table className="history-table">
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Course</th>
                <th scope="col">Status</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const course = courses.get(item.courseId);
                const label = course ? courseLabel(course) : item.courseLabel;
                const selected = ui.selection?.kind === 'meeting'
                  && ui.selection.id === item.meetingId && ui.selection.date === day;
                const open = () => {
                  if (!item.orphaned) actions.openOccurrence(item.meetingId, day);
                };
                return (
                  <tr
                    key={item.id}
                    tabIndex={item.orphaned ? undefined : 0}
                    className={cx(item.orphaned && 'is-orphaned', selected && 'is-selected')}
                    style={course ? { '--accent': accentVar(course.color) } as CSSProperties : undefined}
                    onClick={open}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        open();
                      }
                    }}
                  >
                    <td className="history-time">
                      {formatRange(item.start, item.end, schedule.settings.clock)}
                    </td>
                    <td className="history-course">
                      <div className="history-course-line">
                        {course && <span className="course-dot" aria-hidden />}
                        <span className="history-course-title" title={label}>{label}</span>
                        {course?.code && <span className="course-code">{course.code}</span>}
                      </div>
                      {item.orphaned && <small className="muted">Removed from schedule</small>}
                    </td>
                    <td className="history-status">
                      <div className="history-status-detail">
                        <AttendanceStatus status={item.entry?.status} />
                        <AttendanceArrival entry={item.entry} clock={schedule.settings.clock} />
                      </div>
                    </td>
                    <td className="history-note-cell">
                      <div className="history-note-row">
                        <span className="history-note" title={item.entry?.note}>{item.entry?.note}</span>
                        {item.orphaned && (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Remove attendance for ${label}, ${formatDate(day)}`}
                            onKeyDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              actions.clearEntry(item.id);
                            }}
                          >
                            <Trash2 aria-hidden />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </section>
  );
}
