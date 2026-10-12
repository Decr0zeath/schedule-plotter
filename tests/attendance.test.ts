import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATTENDANCE_STATUSES, LATE_AFTER_MINUTES, arrivalApplies, arrivalToShow,
  createEntry, editEntry, emptyAttendance, entryId, markDayNoClass,
  minutesLate, normalizeAttendance, occurrenceTarget, occurrences, removeEntry, restoreEntries,
  statusForArrival, summarizeAttendance, upsertEntry, type AttendanceEntry,
} from '../src/lib/attendance.ts';
import { buildIcs } from '../src/lib/ics.ts';
import { emptySchedule } from '../src/lib/schedule.ts';
import { localIsoDate, parseIsoDate } from '../src/lib/time.ts';
import type { Meeting } from '../src/lib/types.ts';

const monday: Meeting = { id: 'm', courseId: 'c', day: 1, start: 570, end: 660, room: '' };
const tuesday: Meeting = { ...monday, id: 't', day: 2 };
const schedule = emptySchedule({
  id: 's', termStart: '2026-09-28', termEnd: '2026-10-31',
  courses: [{ id: 'c', code: 'CS101', title: 'Data Structures', color: 'blue', notes: '' }],
  meetings: [monday, tuesday],
});
const entry = (patch: Partial<AttendanceEntry> = {}): AttendanceEntry => ({
  ...createEntry(schedule, monday, '2026-10-12', 'late', 1234), arrived: 582, ...patch,
});
const logOf = (...entries: AttendanceEntry[]) => ({ ...emptyAttendance(), entries });

describe('attendance arrival and identity', () => {
  it('uses the exact 9/10-minute grace boundary', () => {
    assert.equal(LATE_AFTER_MINUTES, 10);
    assert.equal(statusForArrival(579, 570), 'on-time');
    assert.equal(statusForArrival(580, 570), 'late');
    assert.equal(statusForArrival(560, 570), 'on-time');
    assert.equal(minutesLate(entry({ arrived: 580 })), 10);
    assert.equal(minutesLate(entry({ arrived: 560 })), 0);
    assert.equal(minutesLate(entry({ arrived: null })), null);
  });
  it('hides inapplicable arrivals and reports minutes late only for Late and Excused', () => {
    assert.equal(arrivalApplies(undefined), true);
    for (const status of ATTENDANCE_STATUSES) {
      const e = entry({ status });
      const applicable = status !== 'absent' && status !== 'no-class';
      assert.equal(arrivalApplies(status), applicable);
      assert.equal(arrivalToShow(e), applicable ? 582 : null);
      assert.equal(minutesLate(e), status === 'late' || status === 'excused' ? 12 : null);
      assert.equal(arrivalToShow({ ...e, arrived: null }), null);
      assert.equal(minutesLate({ ...e, arrived: null }), null);
    }
    assert.equal(minutesLate(entry({ status: 'on-time', arrived: 571 })), null);
  });
  it('generates deterministic ids and snapshots without changing the schedule', () => {
    assert.equal(entryId('s', 'm', '2026-10-12'), 's/m/2026-10-12');
    assert.deepEqual(
      createEntry(schedule, monday, '2026-10-12', 'late', 1234),
      createEntry(schedule, monday, '2026-10-12', 'late', 1234),
    );
    assert.equal(entry().courseLabel, 'Data Structures');
    assert.equal(entry().start, 570);
    assert.equal(entry().end, 660);
  });
});

describe('normalizeAttendance', () => {
  it('makes junk and unknown formats empty', () => {
    const inputs = [
      null, undefined, [], 42, '{bad json', {}, { entries: [entry()] }, { ...logOf(entry()), version: 2 },
    ];
    for (const raw of inputs) {
      assert.deepEqual(normalizeAttendance(raw), emptyAttendance());
    }
  });
  it('drops malformed records and impossible dates', () => {
    const raw = {
      ...emptyAttendance(),
      entries: [
        null, [], {}, entry({ status: 'bad' as never }), entry({ date: '2026-02-30' }),
        entry({ meetingId: '' }), entry({ end: 100 }), entry({ updatedAt: NaN }), entry(),
      ],
    };
    assert.deepEqual(normalizeAttendance(raw), logOf(entry()));
  });
  it('rebuilds ids, clamps minutes, coerces text, and preserves hidden arrivals', () => {
    const result = normalizeAttendance(logOf(entry({
      id: 'wrong', start: -10, end: 1500, arrived: 1500, note: 42 as never, courseLabel: false as never,
    })));
    assert.deepEqual(result.entries[0], entry({
      start: 0, end: 1440, arrived: 1440, note: '42', courseLabel: 'false',
    }));
    for (const status of ['absent', 'no-class'] as const) {
      const normalized = normalizeAttendance(logOf(entry({ status }))).entries[0];
      assert.equal(normalized.arrived, 582);
      assert.equal(arrivalToShow(normalized), null);
      assert.equal(minutesLate(normalized), null);
    }
    assert.equal(normalizeAttendance(logOf(entry({ status: 'excused' }))).entries[0].arrived, 582);
  });
  it('keeps the greatest updatedAt regardless of input order', () => {
    const newest = entry({ updatedAt: 9999, note: 'new' });
    assert.deepEqual(normalizeAttendance(logOf(newest, entry(), entry({ updatedAt: 5000 }))), logOf(newest));
    assert.deepEqual(normalizeAttendance(logOf(entry(), newest)), logOf(newest));
  });
});

describe('attendance updates and Undo', () => {
  it('derives arrival status and preserves manual choices through notes', () => {
    const edit = (log: ReturnType<typeof emptyAttendance>, patch: Parameters<typeof editEntry>[4]) =>
      editEntry(log, schedule, monday, '2026-10-12', patch, 9999);
    const onTime = edit(emptyAttendance(), { arrived: 579 });
    assert.equal(onTime.entries[0].status, 'on-time');
    const late = edit(onTime, { arrived: 580 });
    assert.equal(late.entries[0].status, 'late');
    const manual = edit(late, { status: 'on-time' });
    assert.equal(edit(manual, { note: 'Permission to arrive later' }).entries[0].status, 'on-time');
    assert.equal(edit(manual, { arrived: 581 }).entries[0].status, 'late');
    const excused = edit(late, { status: 'excused' });
    assert.equal(edit(excused, { arrived: 590 }).entries[0].status, 'excused');
    for (const status of ['absent', 'no-class'] as const) {
      assert.equal(edit(late, { status }).entries[0].arrived, 580);
    }
    assert.equal(edit(late, { arrived: null }).entries[0].arrived, null);
    assert.deepEqual(edit(emptyAttendance(), { arrived: null }), emptyAttendance());
    assert.equal(edit(late, { note: 'Saved' }).entries[0].updatedAt, 9999);
    assert.equal(late.entries[0].note, '');
  });
  it('restores the entered arrival after switching through Absent or No class and reloading', () => {
    const original = logOf(entry());
    for (const status of ['absent', 'no-class'] as const) {
      const hidden = editEntry(original, schedule, monday, '2026-10-12', { status }, 9999);
      assert.equal(hidden.entries[0].arrived, 582);
      assert.equal(arrivalToShow(hidden.entries[0]), null);
      const reloaded = normalizeAttendance(JSON.parse(JSON.stringify(hidden)));
      const restored = editEntry(reloaded, schedule, monday, '2026-10-12', { status: 'late' }, 10000);
      assert.equal(arrivalToShow(restored.entries[0]), 582);
      assert.equal(minutesLate(restored.entries[0]), 12);
    }
  });
  it('keeps the logged snapshot when editing an existing record', () => {
    const changedSchedule = { ...schedule, courses: [{ ...schedule.courses[0], title: 'Renamed' }] };
    const changedMeeting = { ...monday, start: 600, end: 690 };
    const result = editEntry(
      logOf(entry()), changedSchedule, changedMeeting, '2026-10-12', { arrived: 585 }, 9999,
    );
    assert.equal(result.entries[0].courseLabel, 'Data Structures');
    assert.equal(result.entries[0].start, 570);
    assert.equal(result.entries[0].status, 'late');
  });
  it('upserts and removes immutably', () => {
    const original = logOf(entry());
    const changed = upsertEntry(original, entry({ note: 'changed' }));
    assert.equal(changed.entries.length, 1);
    assert.equal(original.entries[0].note, '');
    assert.equal(changed.entries[0].note, 'changed');
    assert.deepEqual(removeEntry(changed, entry().id), emptyAttendance());
  });
  it('marks only the chosen weekday and overwrites existing entries', () => {
    const secondMonday = { ...monday, id: 'm2', start: 700, end: 800 };
    const other = createEntry(schedule, tuesday, '2026-10-13', 'excused', 11);
    const original = logOf(entry(), other);
    const changed = markDayNoClass(
      original, { ...schedule, meetings: [monday, secondMonday, tuesday] }, '2026-10-12', 'Holiday', 9999,
    );
    assert.equal(changed.entries.length, 3);
    assert.deepEqual(changed.entries.find((e) => e.id === other.id), other);
    assert.equal(original.entries[0].status, 'late');
    for (const e of changed.entries.filter((e) => e.date === '2026-10-12')) {
      assert.equal(e.status, 'no-class');
      assert.equal(e.arrived, null);
      assert.equal(e.note, 'Holiday');
      assert.equal(e.updatedAt, 9999);
    }
    assert.equal(markDayNoClass(original, schedule, 'bad', '', 1), original);
    assert.equal(markDayNoClass(original, schedule, '2026-10-14', '', 1), original);
  });
  it('restores the exact previous entries for check-in, Clear, and Mark day', () => {
    const other = createEntry(schedule, tuesday, '2026-10-13', 'excused', 11);
    const previous = logOf(entry(), other);
    const id = entry().id;
    const changes = [
      upsertEntry(previous, entry({ arrived: 600, updatedAt: 9999 })),
      removeEntry(previous, id),
      markDayNoClass(previous, schedule, '2026-10-12', 'Holiday', 9999),
    ];
    for (const changed of changes) {
      assert.deepEqual(restoreEntries(changed, [id], previous), previous);
    }
    assert.deepEqual(restoreEntries(logOf(entry()), [id], emptyAttendance()), emptyAttendance());
    const laterEdit = { ...other, note: 'Keep this later change' };
    assert.deepEqual(restoreEntries(logOf(laterEdit), [id], previous), logOf(entry(), laterEdit));
  });
});

describe('occurrences', () => {
  it('clamps generated rows to both term boundaries', () => {
    const result = occurrences(
      { ...schedule, termStart: '2026-10-05', termEnd: '2026-10-06' },
      emptyAttendance(),
      new Date(2026, 9, 12, 12),
    );
    assert.deepEqual(result.map((o) => o.date), ['2026-10-06', '2026-10-05']);
    assert.deepEqual(occurrences(schedule, emptyAttendance(), new Date(2026, 8, 1)), []);
  });
  it('excludes today until a class starts, then includes its exact start minute', () => {
    const s = {
      ...schedule,
      termStart: '2026-10-12',
      meetings: [monday, { ...monday, id: 'later', start: 720, end: 780 }],
    };
    assert.equal(occurrences(s, emptyAttendance(), new Date(2026, 9, 12, 9, 29)).length, 0);
    const atStart = occurrences(s, emptyAttendance(), new Date(2026, 9, 12, 9, 30));
    assert.deepEqual(atStart.map((o) => o.meetingId), ['m']);
  });
  it('includes deleted and moved entries from snapshots, even outside the range', () => {
    const moved = { ...monday, day: 3, start: 800, end: 900 };
    const future = createEntry(schedule, tuesday, '2026-11-03', 'no-class', 5000);
    const otherSchedule = entry({ id: 'other/m/2026-10-12', scheduleId: 'other' });
    const log = logOf(entry(), future, otherSchedule);
    const result = occurrences(
      { ...schedule, meetings: [moved], termStart: '2026-10-20' }, log, new Date(2026, 9, 12),
    );
    assert.deepEqual(result.map((o) => o.date), ['2026-11-03', '2026-10-12']);
    assert.equal(result[0].orphaned, true);
    assert.equal(result[1].orphaned, false);
    assert.equal(result[1].start, 570);
    assert.equal(result[1].courseLabel, 'Data Structures');
    const linked = occurrences(schedule, log, new Date(2026, 9, 12, 12));
    assert.equal(linked.find((o) => o.id === entry().id)?.orphaned, false);
  });
  it('keeps a moved meeting openable on its original date with its snapshot times', () => {
    const moved = { ...monday, day: 4, start: 800, end: 900 };
    const result = occurrences(
      { ...schedule, meetings: [moved] }, logOf(entry()), new Date(2026, 9, 15, 16),
    );
    const past = result.find((o) => o.id === entry().id)!;
    assert.equal(past.orphaned, false);
    assert.equal(past.meetingId, moved.id);
    assert.equal(past.date, '2026-10-12');
    assert.deepEqual([past.start, past.end], [570, 660]);
  });
  it('orphans entries when their course is deleted or their meeting is reassigned', () => {
    for (const s of [
      { ...schedule, courses: [] },
      { ...schedule, meetings: [{ ...monday, courseId: 'another-course' }] },
    ]) {
      const past = occurrences(s, logOf(entry()), new Date(2026, 9, 12));
      assert.equal(past.find((o) => o.id === entry().id)?.orphaned, true);
    }
  });
  it('keeps orphaned rows when all meetings and courses are deleted', () => {
    const result = occurrences(
      { ...schedule, meetings: [], courses: [] }, logOf(entry()), new Date(2026, 9, 12),
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].orphaned, true);
  });
  it('uses local weekday mapping across month boundaries, including Sunday', () => {
    const s = {
      ...schedule,
      termStart: '2026-09-28',
      termEnd: '2026-10-05',
      meetings: [monday, { ...monday, id: 'sun', day: 7 }],
    };
    const rows = occurrences(s, emptyAttendance(), new Date(2026, 9, 5, 12));
    assert.deepEqual(rows.map((o) => [o.date, o.meetingId]), [
      ['2026-10-05', 'm'], ['2026-10-04', 'sun'], ['2026-09-28', 'm'],
    ]);
  });
  it('walks local dates without repeating or skipping days across daylight saving changes', () => {
    // Also run the suite with TZ=America/New_York. Do not change TZ during a
    // test: --test-isolation=none shares Date instances with other suites.
    const s = {
      ...schedule,
      termStart: '2026-10-31',
      termEnd: '2026-11-03',
      meetings: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ ...monday, id: `day${day}`, day })),
    };
    assert.deepEqual(occurrences(s, emptyAttendance(), new Date(2026, 10, 3, 12)).map((o) => o.date), [
      '2026-11-03', '2026-11-02', '2026-11-01', '2026-10-31',
    ]);
  });
  it('starts at the earliest log without termStart, and at today without logs', () => {
    const s = { ...schedule, termStart: '', termEnd: '' };
    const now = new Date(2026, 9, 13, 12);
    assert.deepEqual(occurrences(s, logOf(entry()), now).map((o) => o.date), ['2026-10-13', '2026-10-12']);
    assert.deepEqual(occurrences(s, emptyAttendance(), now).map((o) => o.date), ['2026-10-13']);
    const future = createEntry(schedule, tuesday, '2026-10-20', 'no-class', 5000);
    assert.deepEqual(occurrences(s, logOf(future), now).map((o) => o.date), ['2026-10-20']);
  });
  it('includes an early check-in today even before class starts, without duplicates', () => {
    const s = { ...schedule, termStart: '2026-10-12' };
    const result = occurrences(
      s, logOf(entry({ arrived: 560, status: 'on-time' })), new Date(2026, 9, 12, 9),
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].orphaned, false);
  });
});

describe('summary and editor date', () => {
  it('counts every status and not logged, but sums minutes from Late entries only', () => {
    const arrivals = { 'on-time': 571, late: 585, absent: 600, excused: 595, 'no-class': 600 };
    const entries = ATTENDANCE_STATUSES.map((status, i) => entry({
      id: `s/m${i}/2026-10-12`, meetingId: `m${i}`, status, arrived: arrivals[status],
    }));
    const rows = occurrences(
      { ...schedule, termStart: '2026-10-12' }, logOf(...entries), new Date(2026, 9, 12, 12),
    );
    assert.deepEqual(summarizeAttendance(rows), {
      counts: { 'on-time': 1, late: 1, absent: 1, excused: 1, 'no-class': 1 },
      notLogged: 1,
      totalMinutesLate: 15,
    });
  });
  it('targets today on the meeting weekday, even before start', () => {
    assert.equal(occurrenceTarget(monday, new Date(2026, 9, 12, 8), schedule), '2026-10-12');
  });
  it('targets the most recent matching weekday and clamps within the term', () => {
    assert.equal(occurrenceTarget(monday, new Date(2026, 9, 14), schedule), '2026-10-12');
    assert.equal(occurrenceTarget(tuesday, new Date(2026, 9, 12), schedule), '2026-10-06');
    assert.equal(occurrenceTarget(monday, new Date(2026, 10, 2), schedule), '2026-10-26');
    assert.equal(occurrenceTarget(monday, new Date(2026, 8, 27), schedule), null);
    assert.equal(occurrenceTarget(
      monday, new Date(2026, 9, 12), { ...schedule, termStart: '2026-10-13' },
    ), null);
    assert.equal(occurrenceTarget(
      monday, new Date(2026, 9, 12), { ...schedule, termStart: '2026-10-06', termEnd: '2026-10-11' },
    ), null);
  });
});

describe('shared local date helpers', () => {
  it('round-trips valid dates and rejects invalid dates', () => {
    assert.equal(localIsoDate(parseIsoDate('2028-02-29')!), '2028-02-29');
    assert.equal(parseIsoDate('2026-02-29'), null);
    assert.equal(parseIsoDate('2026-13-01'), null);
    assert.equal(parseIsoDate('2026-00-10'), null);
  });
  it('keeps calendar export working with shared parsing', () => {
    assert.match(buildIcs(schedule), /DTSTART:20260928T093000/);
    assert.throws(() => buildIcs({ ...schedule, termStart: '2026-02-30' }));
  });
});
