import { courseLabel } from './schedule.ts';
import { clamp, isoWeekday, localIsoDate, minutesOfDay, parseIsoDate } from './time.ts';
import type { Meeting, Schedule } from './types.ts';

export type AttendanceStatus = 'on-time' | 'late' | 'absent' | 'excused' | 'no-class';

export interface AttendanceEntry {
  /** Deterministic across devices. */
  id: string;
  scheduleId: string;
  meetingId: string;
  /** Local calendar date, yyyy-mm-dd. */
  date: string;
  status: AttendanceStatus;
  /** Minutes after midnight; retained but not applicable for absent and no-class. */
  arrived: number | null;
  note: string;
  /** Snapshot at logging time, retained through schedule edits. */
  courseId: string;
  courseLabel: string;
  start: number;
  end: number;
  /** Milliseconds since epoch, for future last-write-wins merging. */
  updatedAt: number;
}

export interface AttendanceLog {
  app: 'schedule-plotter-attendance';
  version: 1;
  entries: AttendanceEntry[];
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['on-time', 'late', 'absent', 'excused', 'no-class'];
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  'on-time': 'On time',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
  'no-class': 'No class',
};
export const LATE_AFTER_MINUTES = 10;

export function statusForArrival(arrived: number, start: number): 'on-time' | 'late' {
  return arrived - start >= LATE_AFTER_MINUTES ? 'late' : 'on-time';
}

export function arrivalApplies(status: AttendanceStatus | undefined): boolean {
  return status !== 'absent' && status !== 'no-class';
}

/** The applicable arrival for display or sync; never expose a hidden stored time. */
export function arrivalToShow(entry: Pick<AttendanceEntry, 'status' | 'arrived'>): number | null {
  return arrivalApplies(entry.status) ? entry.arrived : null;
}

/** Only Late and Excused entries describe an arrival as minutes late. */
export function minutesLate(entry: Pick<AttendanceEntry, 'status' | 'arrived' | 'start'>): number | null {
  const arrived = arrivalToShow(entry);
  if (arrived === null || (entry.status !== 'late' && entry.status !== 'excused')) return null;
  return Math.max(0, arrived - entry.start);
}

export const entryId = (scheduleId: string, meetingId: string, date: string) =>
  `${scheduleId}/${meetingId}/${date}`;

export const emptyAttendance = (): AttendanceLog => ({
  app: 'schedule-plotter-attendance', version: 1, entries: [],
});
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
const minute = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 0, 1440) : null;

export function normalizeAttendance(raw: unknown): AttendanceLog {
  const log = emptyAttendance();
  if (!isObject(raw) || raw.app !== log.app || raw.version !== 1 || !Array.isArray(raw.entries)) return log;
  const entries = new Map<string, AttendanceEntry>();
  for (const r of raw.entries) {
    if (!isObject(r)) continue;
    const scheduleId = str(r.scheduleId);
    const meetingId = str(r.meetingId);
    const date = str(r.date);
    const courseId = str(r.courseId);
    const start = minute(r.start);
    const end = minute(r.end);
    if (
      !scheduleId || !meetingId || !courseId || !parseIsoDate(date)
      || start === null || end === null || end <= start
    ) continue;
    if (!ATTENDANCE_STATUSES.includes(r.status as AttendanceStatus)) continue;
    if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt) || r.updatedAt < 0) continue;
    const status = r.status as AttendanceStatus;
    const entry: AttendanceEntry = {
      id: entryId(scheduleId, meetingId, date),
      scheduleId,
      meetingId,
      date,
      status,
      arrived: minute(r.arrived),
      note: str(r.note),
      courseId,
      courseLabel: str(r.courseLabel),
      start,
      end,
      updatedAt: r.updatedAt,
    };
    const previous = entries.get(entry.id);
    if (!previous || entry.updatedAt >= previous.updatedAt) entries.set(entry.id, entry);
  }
  return { ...log, entries: [...entries.values()] };
}

export function upsertEntry(log: AttendanceLog, entry: AttendanceEntry): AttendanceLog {
  const exists = log.entries.some((e) => e.id === entry.id);
  return {
    ...log,
    entries: exists ? log.entries.map((e) => e.id === entry.id ? entry : e) : [...log.entries, entry],
  };
}

export function removeEntry(log: AttendanceLog, id: string): AttendanceLog {
  return { ...log, entries: log.entries.filter((e) => e.id !== id) };
}

/** Restore only the affected ids, preserving unrelated edits made after a toast. */
export function restoreEntries(
  log: AttendanceLog,
  ids: readonly string[],
  previous: AttendanceLog,
): AttendanceLog {
  const affected = new Set(ids);
  const restored = new Map(log.entries.filter((e) => !affected.has(e.id)).map((e) => [e.id, e]));
  for (const entry of previous.entries) {
    if (affected.has(entry.id)) restored.set(entry.id, entry);
  }
  const entries = previous.entries.flatMap((entry) => {
    const current = restored.get(entry.id);
    restored.delete(entry.id);
    return current ? [current] : [];
  });
  return { ...log, entries: [...entries, ...restored.values()] };
}

export function createEntry(
  schedule: Schedule,
  meeting: Meeting,
  date: string,
  status: AttendanceStatus,
  now: number,
): AttendanceEntry {
  const course = schedule.courses.find((c) => c.id === meeting.courseId);
  return {
    id: entryId(schedule.id, meeting.id, date),
    scheduleId: schedule.id,
    meetingId: meeting.id,
    date,
    status,
    arrived: null,
    note: '',
    courseId: meeting.courseId,
    courseLabel: course ? courseLabel(course) : 'Class',
    start: meeting.start,
    end: meeting.end,
    updatedAt: now,
  };
}

export type AttendancePatch = Partial<Pick<AttendanceEntry, 'status' | 'arrived' | 'note'>>;

/** Manual status choices stick until arrival changes; Excused keeps its status. */
export function editEntry(
  log: AttendanceLog,
  schedule: Schedule,
  meeting: Meeting,
  date: string,
  patch: AttendancePatch,
  now: number,
): AttendanceLog {
  const previous = log.entries.find((e) => e.id === entryId(schedule.id, meeting.id, date));
  if (!previous && patch.arrived === null && patch.status === undefined) return log;
  const entry = {
    ...(previous ?? createEntry(schedule, meeting, date, patch.status ?? 'on-time', now)),
    ...patch,
    updatedAt: now,
  };
  if (patch.arrived != null && (entry.status === 'on-time' || entry.status === 'late')) {
    entry.status = statusForArrival(patch.arrived, entry.start);
  }
  return upsertEntry(log, entry);
}

export function markDayNoClass(
  log: AttendanceLog,
  schedule: Schedule,
  date: string,
  note: string,
  now: number,
): AttendanceLog {
  const parsed = parseIsoDate(date);
  if (!parsed) return log;
  return schedule.meetings
    .filter((m) => m.day === isoWeekday(parsed))
    .reduce((result, meeting) => upsertEntry(result, {
      ...createEntry(schedule, meeting, date, 'no-class', now),
      note,
    }), log);
}

export interface AttendanceOccurrence {
  id: string;
  scheduleId: string;
  meetingId: string;
  date: string;
  courseId: string;
  courseLabel: string;
  start: number;
  end: number;
  entry: AttendanceEntry | null;
  orphaned: boolean;
}

export function occurrences(schedule: Schedule, log: AttendanceLog, now: Date): AttendanceOccurrence[] {
  const today = localIsoDate(now);
  const logged = log.entries.filter((e) => e.scheduleId === schedule.id);
  const earliest = logged.map((e) => e.date).sort()[0] ?? today;
  const first = parseIsoDate(schedule.termStart) ?? parseIsoDate(earliest)!;
  const last = parseIsoDate(schedule.termEnd) && schedule.termEnd < today ? schedule.termEnd : today;
  const result = new Map<string, AttendanceOccurrence>();
  const courses = new Map(schedule.courses.map((c) => [c.id, c]));
  const meetings = new Map(schedule.meetings.map((m) => [m.id, m]));
  for (
    let day = first;
    localIsoDate(day) <= last;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    const date = localIsoDate(day);
    for (const m of schedule.meetings) {
      if (m.day !== isoWeekday(day) || (date === today && m.start > minutesOfDay(now))) continue;
      const course = courses.get(m.courseId);
      if (!course) continue;
      const id = entryId(schedule.id, m.id, date);
      result.set(id, {
        id,
        scheduleId: schedule.id,
        meetingId: m.id,
        date,
        courseId: m.courseId,
        courseLabel: courseLabel(course),
        start: m.start,
        end: m.end,
        entry: null,
        orphaned: false,
      });
    }
  }
  for (const entry of logged) {
    const meeting = meetings.get(entry.meetingId);
    const orphaned = !meeting
      || meeting.courseId !== entry.courseId
      || !courses.has(entry.courseId);
    result.set(entry.id, { ...entry, entry, orphaned });
  }
  return [...result.values()].sort((a, b) =>
    b.date.localeCompare(a.date) || a.start - b.start || a.id.localeCompare(b.id),
  );
}

export function summarizeAttendance(items: readonly AttendanceOccurrence[]) {
  const counts: Record<AttendanceStatus, number> = {
    'on-time': 0, late: 0, absent: 0, excused: 0, 'no-class': 0,
  };
  let notLogged = 0;
  let totalMinutesLate = 0;
  for (const { entry } of items) {
    if (!entry) {
      notLogged++;
      continue;
    }
    counts[entry.status]++;
    if (entry.status === 'late') totalMinutesLate += minutesLate(entry) ?? 0;
  }
  return { counts, notLogged, totalMinutesLate };
}

export function occurrenceTarget(meeting: Meeting, now: Date, schedule: Schedule): string | null {
  const today = localIsoDate(now);
  const end = parseIsoDate(schedule.termEnd);
  const limit = end && schedule.termEnd < today ? end : parseIsoDate(today)!;
  const daysBack = (isoWeekday(limit) - meeting.day + 7) % 7;
  const day = new Date(limit.getFullYear(), limit.getMonth(), limit.getDate() - daysBack);
  const date = localIsoDate(day);
  return parseIsoDate(schedule.termStart) && date < schedule.termStart ? null : date;
}
