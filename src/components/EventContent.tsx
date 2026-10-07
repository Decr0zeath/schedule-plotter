import { MapPin, TriangleAlert } from 'lucide-react';
import { courseLabel } from '../lib/schedule.ts';
import { formatTime, isMorning, meridiem } from '../lib/time.ts';
import type { Clock, Course, Meeting } from '../lib/types.ts';

interface Props {
  course: Course;
  meeting: Pick<Meeting, 'start' | 'end' | 'room'>;
  /** Rendered height in px; decides how much fits. */
  height: number;
  clock: Clock;
  conflict?: boolean;
}

/** The text inside a class block, shared by the grid and the exported poster. */
export function EventContent({ course, meeting, height, clock, conflict }: Props) {
  const title = courseLabel(course);
  if (height < 34) {
    return (
      <div className="ev-line">
        <span className="ev-title">{title}</span>
        <span className="ev-time">{formatTime(meeting.start, clock)}</span>
      </div>
    );
  }
  const showMeta = height >= 54 && (course.code || meeting.room);
  return (
    <>
      <div className="ev-time">
        {conflict && <TriangleAlert className="ev-warn" aria-label="Overlaps another class" />}
        <RangeText start={meeting.start} end={meeting.end} clock={clock} />
      </div>
      <div className={height >= 96 ? 'ev-title is-clamped' : 'ev-title'}>{title}</div>
      {showMeta && (
        <div className="ev-meta">
          {course.code && <span className="ev-code">{course.code}</span>}
          {meeting.room && (
            <span className="ev-room">
              <MapPin aria-hidden />
              {meeting.room}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** Like formatRange, but the AM/PM parts can be hidden when the block is narrow. */
function RangeText({ start, end, clock }: { start: number; end: number; clock: Clock }) {
  if (clock === '24h') return `${formatTime(start, clock)} – ${formatTime(end, clock)}`;
  const shared = isMorning(start) === isMorning(end);
  return (
    <span className="ev-range">
      {formatTime(start, clock, false)}
      {!shared && <span className="mer"> {meridiem(start)}</span>} – {formatTime(end, clock, false)}
      <span className="mer"> {meridiem(end)}</span>
    </span>
  );
}
