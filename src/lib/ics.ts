import { courseLabel } from './schedule.ts';
import { isoWeekday, parseIsoDate } from './time.ts';
import type { Schedule } from './types.ts';

const pad = (n: number) => String(n).padStart(2, '0');

const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Floating local date-time, e.g. 20260810T093000. */
const localStamp = (day: Date, minutes: number) => {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
  return `${ymd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
};

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

/**
 * Weekly recurring events from termStart to termEnd. Times are floating
 * (no time zone), so calendar apps place them at the same wall-clock time.
 */
export function buildIcs(schedule: Schedule, now = new Date()): string {
  const termStart = parseIsoDate(schedule.termStart);
  const termEnd = parseIsoDate(schedule.termEnd);
  if (!termStart || !termEnd || termEnd < termStart) {
    throw new Error('Set the first and last day of the term first.');
  }
  const calName = [schedule.title, schedule.term].filter(Boolean).join(' — ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schedule Plotter//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName || 'Class schedule')}`,
  ];
  const courses = new Map(schedule.courses.map((c) => [c.id, c]));
  for (const m of schedule.meetings) {
    const course = courses.get(m.courseId);
    if (!course) continue;
    const first = new Date(termStart);
    first.setDate(first.getDate() + ((m.day - isoWeekday(first) + 7) % 7));
    if (first > termEnd) continue;
    const summary = course.code ? `${courseLabel(course)} (${course.code})` : courseLabel(course);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}.${schedule.id}@schedule-plotter`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${localStamp(first, m.start)}`,
      `DTEND:${localStamp(first, m.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${ymd(termEnd)}T235959`,
      `SUMMARY:${escapeText(summary)}`,
    );
    if (m.room) lines.push(`LOCATION:${escapeText(m.room)}`);
    if (course.notes.trim()) lines.push(`DESCRIPTION:${escapeText(course.notes.trim())}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
