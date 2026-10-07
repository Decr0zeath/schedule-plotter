export type ColorKey =
  | 'blue'
  | 'orange'
  | 'aqua'
  | 'yellow'
  | 'magenta'
  | 'green'
  | 'violet'
  | 'red'
  | 'gray';

export type Clock = '12h' | '24h';

export interface Course {
  id: string;
  /** Offer / section code, e.g. "11055". Optional. */
  code: string;
  title: string;
  color: ColorKey;
  notes: string;
}

export interface Meeting {
  id: string;
  courseId: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  day: number;
  /** Minutes after midnight. */
  start: number;
  end: number;
  room: string;
}

export interface ViewSettings {
  /** Visible ISO weekdays, ascending. */
  days: number[];
  startHour: number;
  endHour: number;
  /** Shrink the visible hours to the classes instead of startHour–endHour. */
  fitToClasses: boolean;
  /** Drag snapping, in minutes. */
  snap: number;
  clock: Clock;
}

export interface Schedule {
  id: string;
  title: string;
  owner: string;
  /** Free-form term label, e.g. "SY 2025–2026 · 1st Semester". */
  term: string;
  /** yyyy-mm-dd, used for calendar export. Empty when unknown. */
  termStart: string;
  termEnd: string;
  settings: ViewSettings;
  courses: Course[];
  meetings: Meeting[];
}

export interface Workspace {
  app: 'schedule-plotter';
  version: 2;
  activeId: string;
  schedules: Schedule[];
}
