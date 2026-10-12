import { useNow } from '../hooks/useNow.ts';
import {
  ATTENDANCE_STATUSES,
  arrivalApplies,
  arrivalToShow,
  entryId,
  minutesLate,
  occurrenceTarget,
} from '../lib/attendance.ts';
import {
  formatDate,
  formatRange,
  fromTimeInput,
  localIsoDate,
  minutesOfDay,
  parseIsoDate,
  toTimeInput,
} from '../lib/time.ts';
import type { Meeting } from '../lib/types.ts';
import { useAttendanceActions } from '../state/actions.ts';
import { useAttendance } from '../state/attendance.tsx';
import { useStore } from '../state/store.tsx';
import { AttendanceStatus } from './AttendanceStatus.tsx';

/** Only this subtree subscribes to attendance while the schedule editor is open. */
export function AttendanceSection({ meeting, date: explicitDate }: { meeting: Meeting; date?: string }) {
  const { schedule } = useStore();
  const { byId } = useAttendance();
  const actions = useAttendanceActions();
  const now = useNow();
  const date = explicitDate && parseIsoDate(explicitDate)
    ? explicitDate
    : occurrenceTarget(meeting, now, schedule);
  if (!date) return null;
  const entry = byId.get(entryId(schedule.id, meeting.id, date));
  const today = date === localIsoDate(now);
  const showArrival = arrivalApplies(entry?.status);
  const arrived = entry ? arrivalToShow(entry) : null;
  const late = entry ? minutesLate(entry) ?? 0 : 0;
  const tabStop = entry?.status ?? ATTENDANCE_STATUSES[0];

  return (
    <section className="editor-section attendance-editor" aria-label="Attendance">
      <div className="attendance-heading">
        <h3>Attendance</h3>
        {entry && (
          <button type="button" className="btn btn-ghost" onClick={() => actions.clearEntry(entry.id)}>
            Clear
          </button>
        )}
      </div>
      <p className="muted attendance-occurrence">
        {today && 'Today · '}{formatDate(date)} ·{' '}
        {formatRange(entry?.start ?? meeting.start, entry?.end ?? meeting.end, schedule.settings.clock)}
      </p>
      <div className="attendance-options" role="radiogroup" aria-label="Attendance status">
        {ATTENDANCE_STATUSES.map((status, index) => (
          <button
            key={status}
            type="button"
            className="btn attendance-option"
            role="radio"
            aria-checked={entry?.status === status}
            tabIndex={tabStop === status ? 0 : -1}
            onClick={() => actions.setStatus(meeting, date, status)}
            onKeyDown={(e) => {
              const forward = ['ArrowRight', 'ArrowDown'].includes(e.key);
              const backward = ['ArrowLeft', 'ArrowUp'].includes(e.key);
              const direction = Number(forward) - Number(backward);
              if (!direction && e.key !== 'Home' && e.key !== 'End') return;
              e.preventDefault();
              e.stopPropagation();
              const count = ATTENDANCE_STATUSES.length;
              let next = (index + direction + count) % count;
              if (e.key === 'Home') next = 0;
              if (e.key === 'End') next = count - 1;
              actions.setStatus(meeting, date, ATTENDANCE_STATUSES[next]);
              (e.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
            }}
          >
            <AttendanceStatus status={status} />
          </button>
        ))}
      </div>
      {showArrival && (
        <div className="attendance-time-row">
          <label className="field">
            <span>Arrival time</span>
            <input
              className="input"
              type="time"
              step="60"
              value={arrived !== null ? toTimeInput(arrived) : ''}
              onChange={(e) => actions.setArrival(meeting, date, fromTimeInput(e.target.value))}
            />
          </label>
          {today && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => actions.setArrival(meeting, date, minutesOfDay(new Date()))}
            >
              Arrived now
            </button>
          )}
          {late > 0 && <span className="muted attendance-late">{late} min late</span>}
        </div>
      )}
      {entry && (
        <label className="field">
          <span>Note</span>
          <textarea
            className="input"
            rows={2}
            placeholder="What happened? Optional"
            value={entry.note}
            onChange={(e) => actions.setNote(meeting, date, e.target.value)}
          />
        </label>
      )}
    </section>
  );
}
