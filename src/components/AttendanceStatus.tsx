import { CalendarOff, CircleCheck, CircleDashed, CircleX, Clock3, ShieldCheck } from 'lucide-react';
import {
  ATTENDANCE_LABELS,
  arrivalToShow,
  minutesLate,
  type AttendanceEntry,
  type AttendanceStatus as Status,
} from '../lib/attendance.ts';
import { formatTime } from '../lib/time.ts';
import type { Clock } from '../lib/types.ts';

const icons = {
  'on-time': CircleCheck,
  late: Clock3,
  absent: CircleX,
  excused: ShieldCheck,
  'no-class': CalendarOff,
};

export function AttendanceStatus({ status }: { status?: Status }) {
  const Icon = status ? icons[status] : CircleDashed;
  return (
    <span className={`attendance-status status-${status ?? 'unset'}`}>
      <Icon aria-hidden />
      {status ? ATTENDANCE_LABELS[status] : 'Not logged'}
    </span>
  );
}

export function AttendanceArrival({ entry, clock }: { entry: AttendanceEntry | null; clock: Clock }) {
  const arrived = entry ? arrivalToShow(entry) : null;
  if (!entry || arrived === null) return null;
  const late = minutesLate(entry) ?? 0;
  return (
    <span className="attendance-arrival">
      {formatTime(arrived, clock)}
      {late > 0 && <span> · {late} min late</span>}
    </span>
  );
}
