// Pure, immutable edits. Every change to the data goes through one of these so
// that undo/redo can simply keep the previous workspace objects around.

import { nextColor } from '../lib/palette.ts';
import { activeSchedule, emptySchedule, uid } from '../lib/schedule.ts';
import type { Course, Meeting, Schedule, ViewSettings, Workspace } from '../lib/types.ts';

export type ScheduleEdit = (s: Schedule) => Schedule;

export function editActive(ws: Workspace, edit: ScheduleEdit): Workspace {
  const current = activeSchedule(ws);
  const next = edit(current);
  if (next === current) return ws;
  return { ...ws, schedules: ws.schedules.map((s) => (s.id === current.id ? next : s)) };
}

// --- Schedule details & settings -------------------------------------------

export const setDetails =
  (patch: Partial<Pick<Schedule, 'title' | 'owner' | 'term' | 'termStart' | 'termEnd'>>): ScheduleEdit =>
  (s) => ({ ...s, ...patch });

export const setSettings =
  (patch: Partial<ViewSettings>): ScheduleEdit =>
  (s) => ({ ...s, settings: { ...s.settings, ...patch } });

// --- Courses ------------------------------------------------------------------

export function newCourse(s: Schedule, patch: Partial<Course> = {}): Course {
  return { id: uid(), code: '', title: '', color: nextColor(s.courses), notes: '', ...patch };
}

export const addCourse =
  (course: Course): ScheduleEdit =>
  (s) => ({ ...s, courses: [...s.courses, course] });

export const updateCourse =
  (id: string, patch: Partial<Course>): ScheduleEdit =>
  (s) => ({ ...s, courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

export const deleteCourse =
  (id: string): ScheduleEdit =>
  (s) => ({
    ...s,
    courses: s.courses.filter((c) => c.id !== id),
    meetings: s.meetings.filter((m) => m.courseId !== id),
  });

// --- Meetings -------------------------------------------------------------------

export const addMeetings =
  (...meetings: Meeting[]): ScheduleEdit =>
  (s) => ({ ...s, meetings: [...s.meetings, ...meetings] });

export const updateMeeting =
  (id: string, patch: Partial<Meeting>): ScheduleEdit =>
  (s) => ({ ...s, meetings: s.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

export const deleteMeeting =
  (id: string): ScheduleEdit =>
  (s) => ({ ...s, meetings: s.meetings.filter((m) => m.id !== id) });

// --- Schedules (semesters) ------------------------------------------------------

function uniqueId(ws: Workspace, id: string): string {
  return ws.schedules.some((s) => s.id === id) ? uid() : id;
}

export function addSchedule(ws: Workspace, schedule: Schedule): Workspace {
  const s = { ...schedule, id: uniqueId(ws, schedule.id) };
  return { ...ws, schedules: [...ws.schedules, s], activeId: s.id };
}

/** A blank semester that keeps the owner and view settings of the current one. */
export function addBlankSchedule(ws: Workspace): Workspace {
  const current = activeSchedule(ws);
  return addSchedule(
    ws,
    emptySchedule({
      title: current.title,
      owner: current.owner,
      term: 'New semester',
      settings: { ...current.settings },
    }),
  );
}

/** Copies the current semester with fresh ids (handy when most classes carry over). */
export function duplicateSchedule(ws: Workspace): Workspace {
  const current = activeSchedule(ws);
  const courseIds = new Map(current.courses.map((c) => [c.id, uid()]));
  return addSchedule(ws, {
    ...current,
    id: uid(),
    term: current.term ? `${current.term} (copy)` : 'Copy',
    courses: current.courses.map((c) => ({ ...c, id: courseIds.get(c.id)! })),
    meetings: current.meetings.map((m) => ({ ...m, id: uid(), courseId: courseIds.get(m.courseId)! })),
  });
}

export function deleteSchedule(ws: Workspace, id: string): Workspace {
  if (ws.schedules.length <= 1) return ws;
  const index = ws.schedules.findIndex((s) => s.id === id);
  const schedules = ws.schedules.filter((s) => s.id !== id);
  const activeId = ws.activeId === id ? schedules[Math.max(0, index - 1)].id : ws.activeId;
  return { ...ws, schedules, activeId };
}
