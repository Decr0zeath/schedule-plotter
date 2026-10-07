import { useMemo } from 'react';
import { downloadText, readFileAsJson, slugify } from '../lib/download.ts';
import { buildIcs } from '../lib/ics.ts';
import { courseLabel, uid } from '../lib/schedule.ts';
import { readImport } from '../lib/storage.ts';
import { DAY_SHORT, formatTime } from '../lib/time.ts';
import type { Meeting, Schedule } from '../lib/types.ts';
import {
  addBlankSchedule,
  addCourse,
  addMeetings,
  addSchedule,
  deleteCourse,
  deleteMeeting,
  deleteSchedule,
  duplicateSchedule,
  newCourse,
} from './ops.ts';
import { useStore } from './store.tsx';
import { useUI } from './ui.tsx';

/** Commands shared by menus, keyboard shortcuts and panels. */
export function useActions() {
  const store = useStore();
  const ui = useUI();
  const { schedule, workspace, edit, commit, navigate, undo } = store;
  const { toast, select } = ui;

  return useMemo(() => {
    const undoAction = { label: 'Undo', run: undo };
    const courseName = (courseId: string) => {
      const c = schedule.courses.find((x) => x.id === courseId);
      return c ? courseLabel(c) : 'Class';
    };
    const when = (m: Meeting) => `${DAY_SHORT[m.day]} ${formatTime(m.start, schedule.settings.clock)}`;

    return {
      deleteMeeting(id: string) {
        const m = schedule.meetings.find((x) => x.id === id);
        if (!m) return;
        edit(deleteMeeting(id));
        if (ui.selection?.kind === 'meeting' && ui.selection.id === id) {
          select({ kind: 'course', id: m.courseId });
        }
        toast({ message: `Removed ${courseName(m.courseId)} · ${when(m)}`, action: undoAction });
      },

      duplicateMeeting(id: string) {
        const m = schedule.meetings.find((x) => x.id === id);
        if (!m) return;
        const days = schedule.settings.days;
        const nextDay = days.find((d) => d > m.day) ?? days[0] ?? m.day;
        const copy = { ...m, id: uid(), day: nextDay };
        edit(addMeetings(copy));
        select({ kind: 'meeting', id: copy.id });
        toast({ message: `Copied to ${DAY_SHORT[nextDay]}`, action: undoAction });
      },

      deleteCourse(id: string) {
        const name = courseName(id);
        edit(deleteCourse(id));
        select(null);
        toast({ message: `Deleted ${name}`, action: undoAction });
      },

      /** Form-first entry point: a blank course with its editor open. */
      newCourse() {
        const course = newCourse(schedule);
        edit(addCourse(course));
        select({ kind: 'course', id: course.id, focus: true });
        ui.setDrawerOpen(false);
      },

      exportJson() {
        downloadText(JSON.stringify(workspace, null, 2) + '\n', 'schedule.json', 'application/json');
        store.markExported();
        toast({ message: 'Exported schedule.json — commit it to the repo to publish.' });
      },

      exportIcs(dates?: Pick<Schedule, 'termStart' | 'termEnd'>) {
        try {
          const ics = buildIcs({ ...schedule, ...dates });
          downloadText(ics, `${slugify(schedule.term || schedule.title)}.ics`, 'text/calendar');
          toast({ message: `Calendar file saved with ${schedule.meetings.length} weekly events.` });
          return true;
        } catch (e) {
          toast({ message: (e as Error).message, tone: 'error' });
          return false;
        }
      },

      exportPng() {
        ui.requestPoster();
      },

      print() {
        window.print();
      },

      async importFile(file: File) {
        try {
          const imported = readImport(await readFileAsJson(file));
          if (imported.kind === 'workspace') {
            const n = imported.workspace.schedules.length;
            commit(() => imported.workspace);
            toast({ message: `Imported ${n} semester${n === 1 ? '' : 's'} from ${file.name}`, action: undoAction });
          } else {
            commit((ws) => addSchedule(ws, imported.schedule));
            toast({
              message: imported.legacy
                ? `Converted the old-format ${file.name} into a new semester`
                : `Added ${imported.schedule.term || 'schedule'} from ${file.name}`,
              action: undoAction,
            });
          }
          select(null);
        } catch (e) {
          toast({ message: `Couldn't import: ${(e as Error).message}`, tone: 'error' });
        }
      },

      switchSemester(id: string) {
        navigate((ws) => (ws.activeId === id ? ws : { ...ws, activeId: id }));
        select(null);
      },

      newSemester() {
        commit(addBlankSchedule);
        select(null);
        ui.openDialog('settings');
      },

      duplicateSemester() {
        commit(duplicateSchedule);
        select(null);
        toast({ message: 'Semester duplicated — rename it in Settings.', action: undoAction });
      },

      deleteSemester(id: string) {
        const s = workspace.schedules.find((x) => x.id === id);
        commit((ws) => deleteSchedule(ws, id));
        select(null);
        toast({ message: `Deleted ${s?.term || s?.title || 'semester'}`, action: undoAction });
      },
    };
  }, [schedule, workspace, edit, commit, navigate, undo, toast, select, ui, store]);
}
