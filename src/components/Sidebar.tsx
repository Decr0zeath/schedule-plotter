import { MapPin, Plus, TriangleAlert } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { useNow } from '../hooks/useNow.ts';
import { cx } from '../lib/cx.ts';
import { findConflicts } from '../lib/layout.ts';
import { accentVar } from '../lib/palette.ts';
import { courseLabel } from '../lib/schedule.ts';
import {
  describeMeetings,
  minutesByCourse,
  summarize,
  upNext,
  whenLabel,
  type WeekSummary,
} from '../lib/stats.ts';
import { DAY_LONG, DAY_SHORT, formatDuration, formatHours, formatRange, formatTime } from '../lib/time.ts';
import type { Clock, Course, Meeting, Schedule } from '../lib/types.ts';
import { useActions } from '../state/actions.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';

export function Sidebar() {
  const { schedule } = useStore();
  const summary = useMemo(() => summarize(schedule), [schedule]);
  const conflicts = useMemo(() => findConflicts(schedule.meetings), [schedule.meetings]);

  return (
    <div className="sidebar-inner">
      <UpNextCard schedule={schedule} />
      <WeekStats summary={summary} schedule={schedule} />
      {conflicts.length > 0 && <Conflicts pairs={conflicts} schedule={schedule} />}
      <CourseList schedule={schedule} />
    </div>
  );
}

function UpNextCard({ schedule }: { schedule: Schedule }) {
  const now = useNow();
  const { select } = useUI();
  const clock = schedule.settings.clock;
  const { current, next, startsIn, endsIn } = upNext(schedule.meetings, now);
  const courses = new Map(schedule.courses.map((c) => [c.id, c]));

  if (!current && !next) {
    return (
      <section className="card upnext is-empty">
        <span className="eyebrow">Up next</span>
        <p className="muted">Nothing scheduled yet.</p>
      </section>
    );
  }

  const show = current ?? next!;
  const course = courses.get(show.courseId);
  if (!course) return null;
  const progress = current ? 1 - endsIn / (current.end - current.start) : 0;

  return (
    <section className="card upnext" style={{ '--accent': accentVar(course.color) } as CSSProperties}>
      <div className="upnext-top">
        <span className={cx('eyebrow', current && 'is-live')}>
          {current ? (
            <>
              <span className="live-dot" aria-hidden /> Happening now
            </>
          ) : (
            'Up next'
          )}
        </span>
        <span className="upnext-when">
          {current
            ? `${formatDuration(endsIn)} left`
            : `${whenLabel(show, startsIn, now)}${startsIn >= 60 ? ` · ${formatTime(show.start, clock)}` : ''}`}
        </span>
      </div>
      <button type="button" className="upnext-body" onClick={() => select({ kind: 'meeting', id: show.id })}>
        <span className="upnext-title">
          <span className="course-dot" aria-hidden />
          {courseLabel(course)}
        </span>
        <span className="upnext-meta">
          <span>{formatRange(show.start, show.end, clock)}</span>
          {show.room && (
            <span className="upnext-room">
              <MapPin aria-hidden /> {show.room}
            </span>
          )}
          {course.code && <span className="mono">{course.code}</span>}
        </span>
      </button>
      {current && (
        <div className="upnext-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Class progress">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {current && next && courses.get(next.courseId) && (
        <p className="upnext-after">
          Then <strong>{courseLabel(courses.get(next.courseId)!)}</strong>{' '}
          {whenLabel(next, startsIn, now).toLowerCase()}
          {startsIn >= 60 ? ` · ${formatTime(next.start, clock)}` : ''}
        </p>
      )}
    </section>
  );
}

function WeekStats({ summary, schedule }: { summary: WeekSummary; schedule: Schedule }) {
  const days = schedule.settings.days;
  const max = Math.max(...days.map((d) => summary.perDay[d]), 60);
  return (
    <section className="card stats">
      <span className="eyebrow">This week</span>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-value">{formatHours(summary.totalMinutes)}</span>
          <span className="stat-label">hours of class</span>
        </div>
        <div className="stat">
          <span className="stat-value">{summary.courseCount}</span>
          <span className="stat-label">course{summary.courseCount === 1 ? '' : 's'}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{summary.meetingCount}</span>
          <span className="stat-label">meetings</span>
        </div>
        <div className="stat">
          <span className="stat-value">{summary.freeDays.length}</span>
          <span className="stat-label">
            free day{summary.freeDays.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <figure className="load">
        <figcaption>
          <span>Daily load</span>
          {summary.busiestDays.length > 0 && (
            <span className="muted">
              Peak {formatDuration(summary.perDay[summary.busiestDays[0]])} ·{' '}
              {summary.busiestDays.length === 1
                ? DAY_LONG[summary.busiestDays[0]]
                : summary.busiestDays.length === 2
                  ? summary.busiestDays.map((d) => DAY_SHORT[d]).join(' & ')
                  : `${summary.busiestDays.length} days`}
            </span>
          )}
        </figcaption>
        <div className="load-bars" role="list">
          {days.map((d) => {
            const minutes = summary.perDay[d];
            return (
              <div
                key={d}
                className={cx('load-col', summary.busiestDays.includes(d) && 'is-max')}
                role="listitem"
                aria-label={`${DAY_LONG[d]}: ${minutes ? formatDuration(minutes) : 'no classes'}`}
              >
                <span className="load-tip" aria-hidden>
                  {minutes ? formatDuration(minutes) : 'Free'}
                </span>
                <span className="load-track" aria-hidden>
                  <span className="load-bar" style={{ height: `${(minutes / max) * 100}%` }} />
                </span>
                <span className="load-day" aria-hidden>
                  {DAY_SHORT[d].slice(0, 2)}
                </span>
              </div>
            );
          })}
        </div>
      </figure>
    </section>
  );
}

function Conflicts({ pairs, schedule }: { pairs: [Meeting, Meeting][]; schedule: Schedule }) {
  const { select } = useUI();
  const clock = schedule.settings.clock;
  const courses = new Map(schedule.courses.map((c) => [c.id, c]));
  const name = (m: Meeting) => {
    const c = courses.get(m.courseId);
    return c ? courseLabel(c) : 'Class';
  };
  return (
    <section className="overlaps">
      <div className="section-head">
        <h2>
          <TriangleAlert className="overlaps-icon" aria-hidden />
          Overlaps
        </h2>
        <span className="section-count">{pairs.length}</span>
      </div>
      <ul className="overlap-list">
        {pairs.map(([a, b]) => (
          <li key={`${a.id}-${b.id}`}>
            <button type="button" className="overlap-row" onClick={() => select({ kind: 'meeting', id: a.id })}>
              <span className="overlap-names">
                {name(a)} and {name(b)}
              </span>
              <span className="overlap-when">
                {DAY_SHORT[a.day]} {formatTime(Math.max(a.start, b.start), clock)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CourseList({ schedule }: { schedule: Schedule }) {
  const ui = useUI();
  const actions = useActions();
  const minutes = useMemo(() => minutesByCourse(schedule.meetings), [schedule.meetings]);
  const clock = schedule.settings.clock;
  const selectedCourse =
    ui.selection?.kind === 'course'
      ? ui.selection.id
      : ui.selection?.kind === 'meeting'
        ? schedule.meetings.find((m) => m.id === ui.selection!.id)?.courseId
        : undefined;

  return (
    <section className="courses">
      <div className="section-head">
        <h2>Courses</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={actions.newCourse}>
          <Plus aria-hidden /> New
        </button>
      </div>
      {schedule.courses.length === 0 ? (
        <p className="muted courses-empty">Courses you add show up here with their weekly hours.</p>
      ) : (
        <ul className="course-list">
          {schedule.courses.map((c) => (
            <CourseRow
              key={c.id}
              course={c}
              minutes={minutes.get(c.id) ?? 0}
              meetings={schedule.meetings.filter((m) => m.courseId === c.id)}
              clock={clock}
              selected={selectedCourse === c.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CourseRow({
  course,
  minutes,
  meetings,
  clock,
  selected,
}: {
  course: Course;
  minutes: number;
  meetings: Meeting[];
  clock: Clock;
  selected: boolean;
}) {
  const ui = useUI();
  return (
    <li>
      <button
        type="button"
        className={cx('course-row', selected && 'is-selected')}
        style={{ '--accent': accentVar(course.color) } as CSSProperties}
        onClick={() => {
          ui.select({ kind: 'course', id: course.id });
          ui.setDrawerOpen(false);
        }}
        onPointerEnter={() => ui.setHoverCourse(course.id)}
        onPointerLeave={() => ui.setHoverCourse(null)}
        onFocus={() => ui.setHoverCourse(course.id)}
        onBlur={() => ui.setHoverCourse(null)}
      >
        <span className="course-dot" aria-hidden />
        <span className="course-text">
          <span className="course-title">
            {courseLabel(course)}
            {course.code && <span className="course-code">{course.code}</span>}
          </span>
          <span className="course-when">{meetings.length ? describeMeetings(meetings, clock) : 'No meetings yet'}</span>
        </span>
        <span className="course-hours">{minutes ? formatDuration(minutes) : '—'}</span>
      </button>
    </li>
  );
}
