import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildIcs } from '../src/lib/ics.ts';
import { findConflicts, layoutDay } from '../src/lib/layout.ts';
import { fromLegacy, isLegacySchedule } from '../src/lib/legacy.ts';
import { nextColor } from '../src/lib/palette.ts';
import { normalizeWorkspace, parseCourseText, visibleRange } from '../src/lib/schedule.ts';
import { describeMeetings, upNext, whenLabel } from '../src/lib/stats.ts';
import { readImport, signature } from '../src/lib/storage.ts';
import { formatDuration, formatRange, formatTime, fromTimeInput, toTimeInput } from '../src/lib/time.ts';
import type { Course, Meeting, Schedule } from '../src/lib/types.ts';

const meeting = (id: string, day: number, start: number, end: number, courseId = 'c'): Meeting => ({
  id,
  courseId,
  day,
  start,
  end,
  room: '',
});

describe('time', () => {
  it('formats 12h and 24h clocks', () => {
    assert.equal(formatTime(570, '12h'), '9:30 AM');
    assert.equal(formatTime(0, '12h'), '12:00 AM');
    assert.equal(formatTime(720, '12h'), '12:00 PM');
    assert.equal(formatTime(810, '24h'), '13:30');
  });
  it('drops the repeated meridiem in ranges', () => {
    assert.equal(formatRange(570, 690, '12h'), '9:30 – 11:30 AM');
    assert.equal(formatRange(690, 780, '12h'), '11:30 AM – 1:00 PM');
  });
  it('round-trips time inputs', () => {
    assert.equal(fromTimeInput(toTimeInput(845)), 845);
    assert.equal(toTimeInput(1440), '23:59');
    assert.equal(fromTimeInput('25:00'), null);
  });
  it('formats durations', () => {
    assert.equal(formatDuration(150), '2h 30m');
    assert.equal(formatDuration(45), '45m');
    assert.equal(formatDuration(120), '2h');
  });
});

describe('parseCourseText', () => {
  it('reads codes in parentheses before or after the title', () => {
    assert.deepEqual(parseCourseText('(11055) DATA STRUCT'), { code: '11055', title: 'DATA STRUCT' });
    assert.deepEqual(parseCourseText('DATA STRUCT (11091)'), { code: '11091', title: 'DATA STRUCT' });
  });
  it('reads a leading code', () => {
    assert.deepEqual(parseCourseText('11055 Data Structures'), { code: '11055', title: 'Data Structures' });
    assert.deepEqual(parseCourseText('CS 101 - Intro'), { code: 'CS 101', title: 'Intro' });
  });
  it('treats plain text as a title', () => {
    assert.deepEqual(parseCourseText('  Free   Elective '), { code: '', title: 'Free Elective' });
  });
});

describe('layoutDay', () => {
  it('puts overlapping meetings side by side and flags them', () => {
    const placed = layoutDay([meeting('a', 1, 540, 600), meeting('b', 1, 570, 630), meeting('c', 1, 630, 660)]);
    const byId = Object.fromEntries(placed.map((p) => [p.meeting.id, p]));
    assert.equal(byId.a.cols, 2);
    assert.equal(byId.b.cols, 2);
    assert.notEqual(byId.a.col, byId.b.col);
    assert.equal(byId.c.cols, 1);
    assert.ok(byId.a.conflict && byId.b.conflict);
    assert.equal(byId.c.conflict, false);
  });
  it('does not treat back-to-back meetings as overlapping', () => {
    assert.equal(findConflicts([meeting('a', 2, 540, 600), meeting('b', 2, 600, 660)]).length, 0);
    assert.equal(findConflicts([meeting('a', 2, 540, 600), meeting('b', 3, 540, 600)]).length, 0);
  });
});

describe('legacy conversion', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/v1-schedule.json', import.meta.url), 'utf8'));

  it('recognises the old cell-map format', () => {
    assert.ok(isLegacySchedule(legacy));
    assert.equal(isLegacySchedule({ schedules: [] }), false);
  });

  it('merges consecutive 30-minute cells into meetings', () => {
    const s = fromLegacy(legacy);
    assert.equal(s.courses.length, 8);
    assert.equal(s.meetings.length, 18);
    const ds = s.courses.find((c) => c.code === '11055')!;
    const monday = s.meetings.find((m) => m.courseId === ds.id && m.day === 1)!;
    assert.deepEqual([monday.start, monday.end, monday.room], [570, 720, 'I1004']);
  });

  it('is deterministic, so the published signature is stable', () => {
    const a = normalizeWorkspace({ schedules: [fromLegacy(legacy)] });
    const b = normalizeWorkspace({ schedules: [fromLegacy(legacy)] });
    assert.equal(signature(a), signature(b));
  });

  it('gives every course its own palette slot while slots remain', () => {
    const s = fromLegacy(legacy);
    assert.equal(new Set(s.courses.map((c) => c.color)).size, 8);
  });

  it('is accepted by the importer', () => {
    assert.equal(readImport(legacy).kind, 'schedule');
  });
});

describe('palette', () => {
  it('assigns the least-used slot, in order', () => {
    const c = (color: Course['color']): Course => ({ id: color, code: '', title: '', notes: '', color });
    assert.equal(nextColor([]), 'blue');
    assert.equal(nextColor([c('blue'), c('orange')]), 'aqua');
    assert.equal(nextColor([c('blue'), c('aqua')]), 'orange');
  });
});

describe('normalizeWorkspace', () => {
  it('drops broken meetings and orphans', () => {
    const ws = normalizeWorkspace({
      schedules: [
        {
          courses: [{ id: 'x', title: 'Math', color: 'nope' }],
          meetings: [
            { id: '1', courseId: 'x', day: 1, start: 540, end: 600 },
            { id: '2', courseId: 'x', day: 1, start: 600, end: 540 },
            { id: '3', courseId: 'missing', day: 1, start: 540, end: 600 },
            { id: '4', courseId: 'x', day: 9, start: 540, end: 600 },
          ],
        },
      ],
    });
    const s = ws.schedules[0];
    assert.deepEqual(
      s.meetings.map((m) => m.id),
      ['1'],
    );
    assert.equal(s.courses[0].color, 'blue');
  });
  it('rejects things that are not schedules', () => {
    assert.throws(() => normalizeWorkspace({ foo: 1 }));
    assert.throws(() => readImport([1, 2, 3]));
  });
});

const schedule = (meetings: Meeting[], extra: Partial<Schedule> = {}): Schedule => ({
  id: 's',
  title: 'T',
  owner: '',
  term: '',
  termStart: '',
  termEnd: '',
  settings: { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 17, fitToClasses: false, snap: 15, clock: '12h' },
  courses: [{ id: 'c', code: '101', title: 'Math; Logic', color: 'blue', notes: '' }],
  meetings,
  ...extra,
});

describe('visibleRange', () => {
  it('grows to include classes outside the configured hours', () => {
    assert.deepEqual(visibleRange(schedule([meeting('a', 1, 7 * 60 + 30, 9 * 60)])), { start: 420, end: 1020 });
  });
  it('fits to classes when asked', () => {
    const s = schedule([meeting('a', 1, 600, 690)]);
    s.settings.fitToClasses = true;
    assert.deepEqual(visibleRange(s), { start: 540, end: 720 });
  });
});

describe('upNext', () => {
  // Wednesday 7 October 2026, 10:00
  const now = new Date(2026, 9, 7, 10, 0);
  it('finds the class in progress and the one after it', () => {
    const r = upNext([meeting('now', 3, 570, 660), meeting('later', 3, 780, 840)], now);
    assert.equal(r.current?.id, 'now');
    assert.equal(r.endsIn, 60);
    assert.equal(r.next?.id, 'later');
    assert.equal(r.startsIn, 180);
  });
  it('wraps around the week', () => {
    const r = upNext([meeting('mon', 1, 540, 600)], now);
    assert.equal(r.next?.id, 'mon');
    assert.equal(whenLabel(r.next!, r.startsIn, now), 'Monday');
  });
  it('describes grouped meetings', () => {
    const text = describeMeetings([meeting('a', 3, 570, 720), meeting('b', 1, 570, 720)], '12h');
    assert.equal(text, 'Mon & Wed · 9:30 AM – 12:00 PM');
  });
});

describe('buildIcs', () => {
  it('emits weekly events starting on the first matching weekday', () => {
    const s = schedule([{ ...meeting('m1', 3, 570, 720), room: 'I1004' }], {
      termStart: '2026-08-10', // a Monday
      termEnd: '2026-12-11',
    });
    const ics = buildIcs(s, new Date(Date.UTC(2026, 9, 7)));
    assert.match(ics, /DTSTART:20260812T093000\r\n/);
    assert.match(ics, /DTEND:20260812T120000\r\n/);
    assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20261211T235959\r\n/);
    assert.match(ics, /SUMMARY:Math\\; Logic \(101\)\r\n/);
    assert.match(ics, /LOCATION:I1004\r\n/);
    assert.ok(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75));
  });
  it('requires term dates', () => {
    assert.throws(() => buildIcs(schedule([])));
  });
});
