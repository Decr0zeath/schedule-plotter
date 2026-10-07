import type { Clock } from './types.ts';

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

/** ISO weekday (1 = Monday … 7 = Sunday). */
export function isoWeekday(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 7 : js;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

const pad = (n: number) => String(n).padStart(2, '0');

export const isMorning = (minutes: number) => Math.floor(minutes / 60) % 24 < 12;
export const meridiem = (minutes: number) => (isMorning(minutes) ? 'AM' : 'PM');

export function formatTime(minutes: number, clock: Clock, withMeridiem = true): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (clock === '24h') return `${pad(h)}:${pad(m)}`;
  const base = `${h % 12 || 12}:${pad(m)}`;
  return withMeridiem ? `${base} ${meridiem(minutes)}` : base;
}

/** "9:30 – 11:00 AM", or "11:30 AM – 1:00 PM" when the meridiem changes. */
export function formatRange(start: number, end: number, clock: Clock): string {
  if (clock === '24h') return `${formatTime(start, clock)} – ${formatTime(end, clock)}`;
  const shared = isMorning(start) === isMorning(end);
  return `${formatTime(start, clock, !shared)} – ${formatTime(end, clock)}`;
}

export function formatHour(hour: number, clock: Clock): string {
  if (clock === '24h') return `${pad(hour)}:00`;
  return `${hour % 12 || 12} ${hour % 24 < 12 ? 'AM' : 'PM'}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Hours with at most one decimal, e.g. 24.5 → "24.5". */
export function formatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** Value for <input type="time">. */
export function toTimeInput(minutes: number): string {
  if (minutes >= MINUTES_PER_DAY) return '23:59';
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function fromTimeInput(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export const snapRound = (minutes: number, step: number) => Math.round(minutes / step) * step;
export const snapFloor = (minutes: number, step: number) => Math.floor(minutes / step) * step;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Days listed compactly: "Mon", "Mon & Wed", "Mon, Wed, Fri". */
export function joinDays(days: readonly number[]): string {
  const names = days.map((d) => DAY_SHORT[d]);
  if (names.length <= 2) return names.join(' & ');
  return names.join(', ');
}
