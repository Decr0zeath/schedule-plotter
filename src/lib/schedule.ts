import { isColorKey, nextColor } from './palette.ts';
import { MINUTES_PER_DAY, clamp } from './time.ts';
import type { Course, Meeting, Schedule, ViewSettings, Workspace } from './types.ts';

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const DEFAULT_SETTINGS: ViewSettings = {
  days: [1, 2, 3, 4, 5, 6],
  startHour: 7,
  endHour: 19,
  fitToClasses: false,
  snap: 15,
  clock: '12h',
};

export const SNAP_OPTIONS = [5, 10, 15, 30] as const;

export function emptySchedule(partial: Partial<Schedule> = {}): Schedule {
  return {
    id: uid(),
    title: 'Class Schedule',
    owner: '',
    term: '',
    termStart: '',
    termEnd: '',
    settings: { ...DEFAULT_SETTINGS },
    courses: [],
    meetings: [],
    ...partial,
  };
}

export function emptyWorkspace(): Workspace {
  const schedule = emptySchedule({ term: 'New semester' });
  return { app: 'schedule-plotter', version: 2, activeId: schedule.id, schedules: [schedule] };
}

export function activeSchedule(ws: Workspace): Schedule {
  return ws.schedules.find((s) => s.id === ws.activeId) ?? ws.schedules[0];
}

export function sortMeetings(meetings: readonly Meeting[]): Meeting[] {
  return [...meetings].sort((a, b) => a.day - b.day || a.start - b.start || a.end - b.end);
}

export function courseLabel(course: Course): string {
  return course.title || course.code || 'Untitled course';
}

/** The minute range the week grid shows. Always contains every meeting. */
export function visibleRange(schedule: Schedule): { start: number; end: number } {
  const { settings, meetings } = schedule;
  const shown = meetings.filter((m) => settings.days.includes(m.day));
  let start = settings.startHour * 60;
  let end = settings.endHour * 60;
  if (shown.length) {
    const first = Math.min(...shown.map((m) => m.start));
    const last = Math.max(...shown.map((m) => m.end));
    if (settings.fitToClasses) {
      start = Math.floor((first - 30) / 60) * 60;
      end = Math.ceil((last + 30) / 60) * 60;
    } else {
      start = Math.min(start, Math.floor(first / 60) * 60);
      end = Math.max(end, Math.ceil(last / 60) * 60);
    }
  }
  start = clamp(start, 0, MINUTES_PER_DAY - 60);
  end = clamp(Math.max(end, start + 120), start + 60, MINUTES_PER_DAY);
  return { start, end };
}

/**
 * Splits free text such as "(11055) DATA STRUCT", "11055 Data Structures" or
 * "CS 101 Intro" into a code and a title.
 */
export function parseCourseText(text: string): { code: string; title: string } {
  const s = text.replace(/\s+/g, ' ').trim();
  const paren = /\(\s*([A-Za-z0-9][A-Za-z0-9 .-]{0,14}?)\s*\)/.exec(s);
  if (paren) {
    const title = (s.slice(0, paren.index) + s.slice(paren.index + paren[0].length))
      .replace(/\s+/g, ' ')
      .replace(/^[\s·:–-]+|[\s·:–-]+$/g, '');
    return { code: paren[1], title };
  }
  const lead = /^(\d{3,7}|[A-Za-z]{2,5} ?\d{2,4}[A-Za-z]?)(?:\s*[·:–-]\s*|\s+)(.+)$/.exec(s);
  if (lead) return { code: lead[1], title: lead[2] };
  return { code: '', title: s };
}

// ---------------------------------------------------------------------------
// Normalisation: anything read from storage or a file goes through here, so the
// rest of the app can trust the shape.

export class ImportError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

const int = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : fallback;

const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

function normalizeSettings(raw: unknown): ViewSettings {
  const r = isObject(raw) ? raw : {};
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort(
        (a, b) => a - b,
      )
    : DEFAULT_SETTINGS.days;
  const startHour = int(r.startHour, DEFAULT_SETTINGS.startHour, 0, 23);
  const endHour = int(r.endHour, DEFAULT_SETTINGS.endHour, startHour + 1, 24);
  const snap = int(r.snap, DEFAULT_SETTINGS.snap, 5, 60);
  return {
    days: days.length ? days : DEFAULT_SETTINGS.days,
    startHour,
    endHour,
    fitToClasses: r.fitToClasses === true,
    snap: (SNAP_OPTIONS as readonly number[]).includes(snap) ? snap : DEFAULT_SETTINGS.snap,
    clock: r.clock === '24h' ? '24h' : '12h',
  };
}

export function normalizeSchedule(raw: unknown): Schedule {
  if (!isObject(raw)) throw new ImportError('Schedule is not an object.');
  const courses: Course[] = [];
  for (const c of Array.isArray(raw.courses) ? raw.courses : []) {
    if (!isObject(c)) continue;
    courses.push({
      id: str(c.id) || uid(),
      code: str(c.code).trim(),
      title: str(c.title).trim(),
      color: isColorKey(c.color) ? c.color : nextColor(courses),
      notes: str(c.notes),
    });
  }
  const courseIds = new Set(courses.map((c) => c.id));
  const meetings: Meeting[] = [];
  for (const m of Array.isArray(raw.meetings) ? raw.meetings : []) {
    if (!isObject(m) || !courseIds.has(str(m.courseId))) continue;
    const start = int(m.start, -1, 0, MINUTES_PER_DAY - 5);
    const end = int(m.end, -1, 5, MINUTES_PER_DAY);
    const day = typeof m.day === 'number' && Number.isInteger(m.day) && m.day >= 1 && m.day <= 7 ? m.day : null;
    if (start < 0 || end <= start || day === null) continue;
    meetings.push({
      id: str(m.id) || uid(),
      courseId: str(m.courseId),
      day,
      start,
      end,
      room: str(m.room).trim(),
    });
  }
  return {
    id: str(raw.id) || uid(),
    title: str(raw.title, 'Class Schedule'),
    owner: str(raw.owner),
    term: str(raw.term),
    termStart: isoDate(raw.termStart),
    termEnd: isoDate(raw.termEnd),
    settings: normalizeSettings(raw.settings),
    courses,
    meetings,
  };
}

export function normalizeWorkspace(raw: unknown): Workspace {
  if (!isObject(raw) || !Array.isArray(raw.schedules)) {
    throw new ImportError('Not a Schedule Plotter workspace.');
  }
  const schedules = raw.schedules.map(normalizeSchedule);
  if (!schedules.length) throw new ImportError('The workspace has no schedules.');
  // Duplicate ids would make selection ambiguous; re-key any repeats.
  const seen = new Set<string>();
  for (const s of schedules) {
    if (seen.has(s.id)) s.id = uid();
    seen.add(s.id);
  }
  const activeId = schedules.some((s) => s.id === raw.activeId) ? String(raw.activeId) : schedules[0].id;
  return { app: 'schedule-plotter', version: 2, activeId, schedules };
}

export function isWorkspaceLike(raw: unknown): boolean {
  return isObject(raw) && Array.isArray(raw.schedules);
}

export function isScheduleLike(raw: unknown): boolean {
  return isObject(raw) && Array.isArray(raw.courses) && Array.isArray(raw.meetings);
}
