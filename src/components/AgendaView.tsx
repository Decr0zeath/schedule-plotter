import { MapPin, TriangleAlert } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { useNow } from '../hooks/useNow.ts';
import { cx } from '../lib/cx.ts';
import { layoutDay } from '../lib/layout.ts';
import { accentVar } from '../lib/palette.ts';
import { courseLabel } from '../lib/schedule.ts';
import { DAY_LONG, formatDuration, formatRange, isoWeekday } from '../lib/time.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';
import { EmptyState } from './EmptyState.tsx';

/** Every meeting as a table, day by day — the grid's accessible twin. */
export function AgendaView() {
  const { schedule } = useStore();
  const ui = useUI();
  const today = isoWeekday(useNow());
  const clock = schedule.settings.clock;
  const courses = useMemo(() => new Map(schedule.courses.map((c) => [c.id, c])), [schedule.courses]);
  const days = useMemo(() => {
    const shown = new Set([...schedule.settings.days, ...schedule.meetings.map((m) => m.day)]);
    return [...shown]
      .sort((a, b) => a - b)
      .map((day) => ({ day, placed: layoutDay(schedule.meetings.filter((m) => m.day === day)) }));
  }, [schedule.meetings, schedule.settings.days]);

  if (!schedule.meetings.length) {
    return (
      <section className="agenda is-empty">
        <EmptyState />
      </section>
    );
  }

  return (
    <section className="agenda" aria-label="Schedule by day">
      {days.map(({ day, placed }) => {
        const total = placed.reduce((sum, p) => sum + p.meeting.end - p.meeting.start, 0);
        return (
          <section key={day} className={cx('agenda-day', day === today && 'is-today')}>
            <header className="agenda-head">
              <h2>{DAY_LONG[day]}</h2>
              {day === today && <span className="today-pill">Today</span>}
              <span className="muted">
                {placed.length
                  ? `${placed.length} class${placed.length === 1 ? '' : 'es'} · ${formatDuration(total)}`
                  : 'No classes'}
              </span>
            </header>
            {placed.length > 0 && (
              <table className="agenda-table">
                <thead className="visually-hidden">
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Course</th>
                    <th scope="col">Room</th>
                    <th scope="col">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {placed.map(({ meeting: m, conflict }) => {
                    const course = courses.get(m.courseId);
                    if (!course) return null;
                    return (
                      <tr
                        key={m.id}
                        tabIndex={0}
                        className={cx(ui.selection?.kind === 'meeting' && ui.selection.id === m.id && 'is-selected')}
                        style={{ '--accent': accentVar(course.color) } as CSSProperties}
                        onClick={() => ui.select({ kind: 'meeting', id: m.id })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') ui.select({ kind: 'meeting', id: m.id });
                        }}
                      >
                        <td className="agenda-time">{formatRange(m.start, m.end, clock)}</td>
                        <td className="agenda-course">
                          <span className="course-dot" aria-hidden />
                          <span className="agenda-title">{courseLabel(course)}</span>
                          {course.code && <span className="course-code">{course.code}</span>}
                          {conflict && (
                            <span className="agenda-conflict">
                              <TriangleAlert aria-hidden /> Overlaps
                            </span>
                          )}
                        </td>
                        <td className="agenda-room">
                          {m.room ? (
                            <>
                              <MapPin aria-hidden /> {m.room}
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="agenda-length">{formatDuration(m.end - m.start)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </section>
  );
}
