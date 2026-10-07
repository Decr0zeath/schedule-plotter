import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNow } from '../hooks/useNow.ts';
import { cx } from '../lib/cx.ts';
import { layoutDay, type Placed } from '../lib/layout.ts';
import { accentVar } from '../lib/palette.ts';
import { courseLabel, uid, visibleRange } from '../lib/schedule.ts';
import {
  DAY_LONG,
  DAY_SHORT,
  clamp,
  formatDuration,
  formatHour,
  formatRange,
  formatTime,
  isoWeekday,
  minutesOfDay,
  snapFloor,
  snapRound,
} from '../lib/time.ts';
import type { Clock, Course, Meeting } from '../lib/types.ts';
import { addMeetings, updateMeeting } from '../state/ops.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';
import { EmptyState } from './EmptyState.tsx';
import { EventContent } from './EventContent.tsx';
import { QuickAdd } from './QuickAdd.tsx';

/** Vertical breathing room so the first and last hour labels aren't clipped. */
const PAD = 12;
const MIN_HOUR_PX = 44;
const MAX_HOUR_PX = 132;
const DRAG_THRESHOLD = 4;
const TOUCH_SLOP = 8;
const LONG_PRESS_MS = 320;

export interface Draft {
  /** The meeting being moved/resized; absent while creating. */
  id?: string;
  day: number;
  start: number;
  end: number;
}

interface Gesture {
  kind: 'create' | 'move' | 'resize';
  pointerId: number;
  touch: boolean;
  x: number;
  y: number;
  /** press → drag, or abandoned once a touch turns into a scroll/swipe. */
  phase: 'press' | 'drag' | 'abandoned';
  timer?: ReturnType<typeof setTimeout>;
  day: number;
  anchor: number;
  meeting?: Meeting;
  offset: number;
  edge?: 'start' | 'end';
}

interface Props {
  days: number[];
  /** Horizontal swipe on touch screens (single-day view). */
  onSwipe?: (direction: 1 | -1) => void;
}

export function WeekGrid({ days, onSwipe }: Props) {
  const { schedule, edit, undo } = useStore();
  const ui = useUI();
  const now = useNow();
  const { settings } = schedule;
  const { snap, clock } = settings;

  const range = useMemo(() => visibleRange(schedule), [schedule]);
  const hours = (range.end - range.start) / 60;

  // --- Fit the day into the available height -----------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [hourPx, setHourPx] = useState(56);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const head = headRef.current?.offsetHeight ?? 0;
      const available = el.clientHeight - head - PAD * 2;
      setHourPx(clamp(Math.floor((available / hours) * 10) / 10, MIN_HOUR_PX, MAX_HOUR_PX));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hours]);
  const ppm = hourPx / 60;
  const y = (minutes: number) => (minutes - range.start) * ppm;

  // When the day doesn't fit, start scrolled to the first class.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    const first = Math.min(...schedule.meetings.filter((m) => days.includes(m.day)).map((m) => m.start));
    if (Number.isFinite(first)) el.scrollTop = Math.max(0, y(first) - 24);
    // Only on semester switch, not on every edit.
  }, [schedule.id]);

  const courses = useMemo(() => new Map(schedule.courses.map((c) => [c.id, c])), [schedule.courses]);
  const byDay = useMemo(() => {
    const out = new Map<number, Placed[]>();
    for (const d of days) out.set(d, layoutDay(schedule.meetings.filter((m) => m.day === d)));
    return out;
  }, [schedule.meetings, days]);
  const dayTotals = useMemo(() => {
    const totals = new Map<number, number>();
    for (const m of schedule.meetings) totals.set(m.day, (totals.get(m.day) ?? 0) + m.end - m.start);
    return totals;
  }, [schedule.meetings]);

  // --- Gestures -------------------------------------------------------------------
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Draft | null>(null);
  const [pendingEl, setPendingEl] = useState<HTMLDivElement | null>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  /** A block that was just dropped: skip its position transition so it doesn't slide from the old spot. */
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setSettled(null), 80);
    return () => clearTimeout(t);
  }, [settled]);

  const hideHoverSlot = () => {
    if (hoverRef.current) hoverRef.current.style.opacity = '0';
  };
  const showHoverSlot = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = hoverRef.current;
    const cols = colsRef.current;
    if (!el || !cols) return;
    if (pending || (e.target as HTMLElement).closest('[data-meeting-id]')) return hideHoverSlot();
    const rect = cols.getBoundingClientRect();
    const { minutes } = locate(e.clientX, e.clientY);
    const index = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * days.length), 0, days.length - 1);
    const start = clamp(snapFloor(minutes, Math.max(snap, 30)), range.start, range.end - 30);
    const end = Math.min(range.end, start + 60);
    const width = rect.width / days.length;
    el.style.opacity = '1';
    el.style.transform = `translate(${index * width + 3}px, ${y(start) + 1}px)`;
    el.style.width = `${width - 6}px`;
    el.style.height = `${(end - start) * ppm - 2}px`;
    el.dataset.label = `+ ${formatTime(start, clock)}`;
  };

  const locate = (clientX: number, clientY: number) => {
    const rect = colsRef.current!.getBoundingClientRect();
    const index = clamp(Math.floor(((clientX - rect.left) / rect.width) * days.length), 0, days.length - 1);
    return { day: days[index], minutes: range.start + (clientY - rect.top) / ppm };
  };

  const preview = (g: Gesture, clientX: number, clientY: number): Draft => {
    const { day, minutes } = locate(clientX, clientY);
    if (g.kind === 'create') {
      const at = clamp(snapRound(minutes, snap), range.start, range.end);
      return {
        day: g.day,
        start: Math.min(g.anchor, at),
        end: Math.min(range.end, Math.max(g.anchor + snap, at)),
      };
    }
    const m = g.meeting!;
    if (g.kind === 'move') {
      const length = m.end - m.start;
      const start = clamp(snapRound(minutes - g.offset, snap), range.start, range.end - length);
      return { id: m.id, day, start, end: start + length };
    }
    if (g.edge === 'end') {
      return { id: m.id, day: m.day, start: m.start, end: clamp(snapRound(minutes, snap), m.start + snap, range.end) };
    }
    return { id: m.id, day: m.day, start: clamp(snapRound(minutes, snap), range.start, m.end - snap), end: m.end };
  };

  const endGesture = () => {
    const g = gesture.current;
    if (g?.timer) clearTimeout(g.timer);
    gesture.current = null;
    setDraft(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || pending) return;
    const target = e.target as HTMLElement;
    const eventEl = target.closest<HTMLElement>('[data-meeting-id]');
    const edgeAttr = target.closest<HTMLElement>('[data-edge]')?.dataset.edge;
    const { day, minutes } = locate(e.clientX, e.clientY);
    const touch = e.pointerType === 'touch';
    const base = { pointerId: e.pointerId, touch, x: e.clientX, y: e.clientY, phase: 'press' as const };

    let g: Gesture;
    if (eventEl) {
      const meeting = schedule.meetings.find((m) => m.id === eventEl.dataset.meetingId);
      if (!meeting) return;
      g = edgeAttr
        ? { ...base, kind: 'resize', edge: edgeAttr as 'start' | 'end', meeting, day, anchor: 0, offset: 0 }
        : { ...base, kind: 'move', meeting, day, anchor: 0, offset: minutes - meeting.start };
    } else {
      const anchor = clamp(snapFloor(minutes, snap), range.start, range.end - snap);
      g = { ...base, kind: 'create', day, anchor, offset: 0 };
    }
    gesture.current = g;

    if (touch) {
      // Touch: a long press picks things up; anything quicker is a scroll, swipe or tap.
      g.timer = setTimeout(() => {
        if (gesture.current !== g || g.phase !== 'press') return;
        g.phase = 'drag';
        navigator.vibrate?.(8);
        setDraft(preview(g, g.x, g.y));
      }, LONG_PRESS_MS);
    } else {
      colsRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g && e.pointerType === 'mouse') showHoverSlot(e);
    if (!g || e.pointerId !== g.pointerId) return;
    hideHoverSlot();
    if (g.phase === 'press') {
      const distance = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (g.touch) {
        if (distance > TOUCH_SLOP) {
          clearTimeout(g.timer);
          g.phase = 'abandoned';
        }
        return;
      }
      if (distance < DRAG_THRESHOLD) return;
      g.phase = 'drag';
    }
    if (g.phase === 'drag') setDraft(preview(g, e.clientX, e.clientY));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const final = g.phase === 'drag' ? preview(g, e.clientX, e.clientY) : null;
    endGesture();

    if (g.phase === 'abandoned') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
      return;
    }

    if (!final) {
      // A click or tap.
      if (g.kind !== 'create') {
        ui.select({ kind: 'meeting', id: g.meeting!.id });
      } else if (ui.selection) {
        ui.select(null);
      } else {
        setPending({ day: g.day, start: g.anchor, end: Math.min(range.end, g.anchor + 60) });
      }
      return;
    }

    if (g.kind === 'create') {
      setPending(final);
      return;
    }
    const m = g.meeting!;
    if (final.day === m.day && final.start === m.start && final.end === m.end) return;
    if (g.kind === 'move' && e.altKey) {
      edit(addMeetings({ ...m, id: uid(), day: final.day, start: final.start, end: final.end }));
      ui.toast({ message: `Copied to ${DAY_SHORT[final.day]} ${formatTime(final.start, clock)}`, action: { label: 'Undo', run: undo } });
    } else {
      setSettled(m.id);
      edit(updateMeeting(m.id, { day: final.day, start: final.start, end: final.end }));
    }
  };

  // Escape cancels a drag in progress.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gesture.current?.phase === 'drag') {
        e.stopPropagation();
        endGesture();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Once a touch drag has started, stop the page from scrolling under it.
  useEffect(() => {
    const el = colsRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current?.phase === 'drag') e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  // --- Render ----------------------------------------------------------------------
  const today = isoWeekday(now);
  const nowMinutes = minutesOfDay(now);
  const showNow = days.includes(today) && nowMinutes >= range.start && nowMinutes <= range.end;
  const highlightCourse = ui.hoverCourse;
  const selectedId = ui.selection?.kind === 'meeting' ? ui.selection.id : null;
  const selectedCourse = ui.selection?.kind === 'course' ? ui.selection.id : null;
  const bodyHeight = hours * hourPx;
  const draftCourse = draft?.id ? courses.get(schedule.meetings.find((m) => m.id === draft.id)?.courseId ?? '') : undefined;

  const hourLines: number[] = [];
  for (let h = range.start / 60; h <= range.end / 60; h++) hourLines.push(h);

  return (
    <section
      className={cx('grid-card', draft && 'is-dragging', days.length === 1 && 'is-single')}
      aria-label="Weekly schedule"
    >
      <div className="grid-scroll" ref={scrollRef}>
        <div
          className="grid-head"
          ref={headRef}
          style={{ gridTemplateColumns: `var(--gutter) repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="grid-corner" />
          {days.map((d) => (
            <div key={d} className={cx('day-head', d === today && 'is-today')}>
              <span className="day-name">
                <span className="day-name-long">{DAY_LONG[d]}</span>
                <span className="day-name-short">{DAY_SHORT[d]}</span>
              </span>
              <span className="day-total">{dayTotals.get(d) ? formatDuration(dayTotals.get(d)!) : 'Free'}</span>
            </div>
          ))}
        </div>

        <div className="grid-body" style={{ height: bodyHeight + PAD * 2 }}>
          <div className="gutter" style={{ top: PAD, height: bodyHeight }} aria-hidden>
            {hourLines.map((h) => (
              <span key={h} className="hour-label" style={{ top: y(h * 60) }}>
                {formatHour(h, clock)}
              </span>
            ))}
            {showNow && (
              <span className="now-label" style={{ top: y(nowMinutes) }}>
                {formatTime(nowMinutes, clock, false)}
              </span>
            )}
          </div>

          <div
            className="cols"
            ref={colsRef}
            style={
              {
                top: PAD,
                height: bodyHeight,
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                '--hour': `${hourPx}px`,
              } as CSSProperties
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={endGesture}
            onPointerLeave={hideHoverSlot}
            onContextMenu={(e) => gesture.current && e.preventDefault()}
          >
            <div className="hover-slot" ref={hoverRef} aria-hidden />
            {days.map((d) => (
              <div key={d} className={cx('col', d === today && 'is-today')} data-day={d}>
                {byDay.get(d)!.map((p, i) => {
                  const m = p.meeting;
                  const course = courses.get(m.courseId);
                  if (!course) return null;
                  const height = (m.end - m.start) * ppm;
                  return (
                    <div
                      key={m.id}
                      data-meeting-id={m.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedId === m.id}
                      aria-label={`${courseLabel(course)}${course.code ? ` (${course.code})` : ''}, ${DAY_LONG[m.day]} ${formatRange(m.start, m.end, clock)}${m.room ? `, room ${m.room}` : ''}${p.conflict ? ', overlaps another class' : ''}`}
                      className={cx(
                        'ev',
                        selectedId === m.id && 'is-selected',
                        (selectedCourse === course.id || ui.hoverMeeting === m.id) && 'is-linked',
                        highlightCourse && highlightCourse !== course.id && 'is-dimmed',
                        p.conflict && 'is-conflict',
                        draft?.id === m.id && 'is-ghost',
                        settled === m.id && 'is-settled',
                        height < 34 && 'is-short',
                      )}
                      style={
                        {
                          top: y(m.start) + 1,
                          height: height - 2,
                          left: `calc(${(p.col / p.cols) * 100}% + 3px)`,
                          width: `calc(${100 / p.cols}% - 6px)`,
                          '--accent': accentVar(course.color),
                          '--i': i + d,
                        } as CSSProperties
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          ui.select({ kind: 'meeting', id: m.id });
                        }
                      }}
                      onPointerEnter={() => ui.setHoverMeeting(m.id)}
                      onPointerLeave={() => ui.setHoverMeeting(null)}
                    >
                      <span className="ev-edge is-start" data-edge="start" />
                      <EventContent course={course} meeting={m} height={height} clock={clock} conflict={p.conflict} />
                      <span className="ev-edge is-end" data-edge="end" />
                    </div>
                  );
                })}

                {draft?.day === d && (
                  <DraftBlock draft={draft} course={draftCourse} y={y} ppm={ppm} clock={clock} />
                )}
                {pending?.day === d && (
                  <DraftBlock draft={pending} y={y} ppm={ppm} clock={clock} ref={setPendingEl} />
                )}
                {showNow && d === today && (
                  <div className="now-line" style={{ top: y(nowMinutes) }} aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {schedule.meetings.length === 0 && !pending && !draft && <EmptyState />}

      {pending && (
        <QuickAdd
          draft={pending}
          anchor={pendingEl}
          onClose={() => {
            setPending(null);
            setPendingEl(null);
          }}
        />
      )}
    </section>
  );
}

interface DraftProps {
  draft: Draft;
  course?: Course;
  y: (minutes: number) => number;
  ppm: number;
  clock: Clock;
  ref?: (el: HTMLDivElement | null) => void;
}

function DraftBlock({ draft, course, y, ppm, clock, ref }: DraftProps) {
  const height = (draft.end - draft.start) * ppm;
  return (
    <div
      ref={ref}
      className={cx('ev', 'is-draft', !course && 'is-new')}
      style={
        {
          top: y(draft.start) + 1,
          height: height - 2,
          left: '3px',
          width: 'calc(100% - 6px)',
          '--accent': course ? accentVar(course.color) : 'var(--ink)',
        } as CSSProperties
      }
      aria-hidden
    >
      {course ? (
        <EventContent course={course} meeting={{ ...draft, room: '' }} height={height} clock={clock} />
      ) : (
        <>
          <div className="ev-time">{formatRange(draft.start, draft.end, clock)}</div>
          {height >= 48 && <div className="ev-title">New class</div>}
        </>
      )}
      <span className="draft-duration">{formatDuration(draft.end - draft.start)}</span>
    </div>
  );
}
