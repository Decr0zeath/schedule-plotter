import { sortMeetings } from './schedule.ts';
import {
  DAY_LONG,
  MINUTES_PER_DAY,
  MINUTES_PER_WEEK,
  formatRange,
  isoWeekday,
  joinDays,
  minutesOfDay,
} from './time.ts';
import type { Clock, Meeting, Schedule } from './types.ts';

const duration = (m: Meeting) => m.end - m.start;

export interface WeekSummary {
  totalMinutes: number;
  meetingCount: number;
  courseCount: number;
  /** Minutes of class per ISO weekday (index 1–7). */
  perDay: number[];
  /** Days that share the highest load (ties included). */
  busiestDays: number[];
  /** Visible days without any class. */
  freeDays: number[];
}

export function summarize(schedule: Schedule): WeekSummary {
  const perDay = Array<number>(8).fill(0);
  for (const m of schedule.meetings) perDay[m.day] += duration(m);
  const peak = Math.max(...perDay);
  const busiestDays = peak > 0 ? [1, 2, 3, 4, 5, 6, 7].filter((d) => perDay[d] === peak) : [];
  return {
    totalMinutes: perDay.reduce((a, b) => a + b, 0),
    meetingCount: schedule.meetings.length,
    courseCount: schedule.courses.length,
    perDay,
    busiestDays,
    freeDays: schedule.settings.days.filter((d) => perDay[d] === 0),
  };
}

export function minutesByCourse(meetings: readonly Meeting[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of meetings) out.set(m.courseId, (out.get(m.courseId) ?? 0) + duration(m));
  return out;
}

/** "Mon & Wed · 9:30 – 12:00 PM", grouping days that share the same hours. */
export function describeMeetings(meetings: readonly Meeting[], clock: Clock): string {
  const groups = new Map<string, { start: number; end: number; days: number[] }>();
  for (const m of sortMeetings(meetings)) {
    const key = `${m.start}-${m.end}`;
    const g = groups.get(key) ?? { start: m.start, end: m.end, days: [] };
    g.days.push(m.day);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => `${joinDays(g.days)} · ${formatRange(g.start, g.end, clock)}`)
    .join('  ·  ');
}

export interface UpNext {
  current: Meeting | null;
  next: Meeting | null;
  /** Minutes until `next` starts. */
  startsIn: number;
  /** Minutes until `current` ends. */
  endsIn: number;
}

export function upNext(meetings: readonly Meeting[], now: Date): UpNext {
  const nowWeek = (isoWeekday(now) - 1) * MINUTES_PER_DAY + minutesOfDay(now);
  let current: Meeting | null = null;
  let endsIn = 0;
  let next: Meeting | null = null;
  let startsIn = Infinity;
  for (const m of meetings) {
    const start = (m.day - 1) * MINUTES_PER_DAY + m.start;
    const end = (m.day - 1) * MINUTES_PER_DAY + m.end;
    if (start <= nowWeek && nowWeek < end) {
      if (!current || end - nowWeek < endsIn) {
        current = m;
        endsIn = end - nowWeek;
      }
      continue;
    }
    const until = (start - nowWeek + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
    if (until < startsIn) {
      next = m;
      startsIn = until;
    }
  }
  return { current, next, startsIn: Number.isFinite(startsIn) ? startsIn : 0, endsIn };
}

/** "In 25 min", "Today", "Tomorrow", "Thursday". */
export function whenLabel(meeting: Meeting, startsIn: number, now: Date): string {
  if (startsIn < 60) return `In ${Math.max(1, startsIn)} min`;
  const today = isoWeekday(now);
  const daysAhead = (meeting.day - today + 7) % 7;
  const crossesWeek = daysAhead === 0 && startsIn >= MINUTES_PER_DAY;
  if (daysAhead === 0 && !crossesWeek) {
    const h = Math.floor(startsIn / 60);
    const m = startsIn % 60;
    return m ? `In ${h}h ${m}m` : `In ${h}h`;
  }
  if (daysAhead === 1) return 'Tomorrow';
  return crossesWeek ? `Next ${DAY_LONG[meeting.day]}` : DAY_LONG[meeting.day];
}
