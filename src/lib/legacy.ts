import { nextColor } from './palette.ts';
import { emptySchedule, parseCourseText } from './schedule.ts';
import type { Course, Meeting, Schedule } from './types.ts';

/**
 * The first version of the plotter stored a flat map of 30-minute cells:
 *   { "9:30-1": { "subject": "(11055) DATA STRUCT", "room": "I1004" }, … }
 * where the key is "<hour>:<minute>-<weekday 1-7>" and consecutive cells with
 * the same subject formed one class.
 */
export type LegacyData = Record<string, { subject?: unknown; room?: unknown }>;

const LEGACY_KEY = /^(\d{1,2}):(\d{1,2})-([1-7])$/;
const LEGACY_SLOT = 30;

export function isLegacySchedule(raw: unknown): raw is LegacyData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  return keys.length > 0 && keys.every((k) => LEGACY_KEY.test(k));
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'course';

export function fromLegacy(data: LegacyData, meta: Partial<Schedule> = {}): Schedule {
  const cells: { day: number; start: number; subject: string; room: string }[] = [];
  for (const [key, cell] of Object.entries(data)) {
    const match = LEGACY_KEY.exec(key);
    const subject = typeof cell?.subject === 'string' ? cell.subject.trim() : '';
    if (!match || !subject) continue; // rooms typed into empty cells are dropped
    cells.push({
      day: Number(match[3]),
      start: Number(match[1]) * 60 + Number(match[2]),
      subject,
      room: typeof cell.room === 'string' ? cell.room.trim() : '',
    });
  }
  cells.sort((a, b) => a.day - b.day || a.start - b.start);

  // Ids are derived from content so converting the same file twice gives the
  // same workspace (the published-vs-local comparison relies on this).
  const courses = new Map<string, Course>();
  const meetings: Meeting[] = [];
  for (let i = 0; i < cells.length; ) {
    const first = cells[i];
    let end = first.start + LEGACY_SLOT;
    let room = first.room;
    let j = i + 1;
    while (
      j < cells.length &&
      cells[j].day === first.day &&
      cells[j].subject === first.subject &&
      cells[j].start === end
    ) {
      end += LEGACY_SLOT;
      room ||= cells[j].room;
      j++;
    }

    const { code, title } = parseCourseText(first.subject);
    const key = code ? code.toLowerCase() : title.toLowerCase();
    let course = courses.get(key);
    if (!course) {
      course = { id: `c-${slug(key)}`, code, title, color: nextColor([...courses.values()]), notes: '' };
      courses.set(key, course);
    }
    meetings.push({
      id: `m-${first.day}-${first.start}-${slug(key)}`,
      courseId: course.id,
      day: first.day,
      start: first.start,
      end,
      room,
    });
    i = j;
  }

  const usesSunday = meetings.some((m) => m.day === 7);
  const base = emptySchedule({ id: 'legacy-import', ...meta });
  return {
    ...base,
    settings: {
      ...base.settings,
      days: usesSunday ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6],
      startHour: 7,
      endHour: 19,
      snap: LEGACY_SLOT,
    },
    courses: [...courses.values()],
    meetings,
  };
}
