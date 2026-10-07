import { Clock3, CornerDownLeft, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '../hooks/useDismiss.ts';
import { cx } from '../lib/cx.ts';
import { accentVar, nextColor } from '../lib/palette.ts';
import { courseLabel, parseCourseText, uid } from '../lib/schedule.ts';
import { DAY_LONG, DAY_SHORT, formatDuration, formatRange } from '../lib/time.ts';
import type { Course } from '../lib/types.ts';
import { addCourse, addMeetings, newCourse } from '../state/ops.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';
import type { Draft } from './WeekGrid.tsx';

type Option = { kind: 'course'; course: Course } | { kind: 'new'; code: string; title: string };

interface Props {
  draft: Draft;
  anchor: HTMLElement | null;
  onClose: () => void;
}

/** The popover that appears after dragging out (or tapping) a new time slot. */
export function QuickAdd({ draft, anchor, onClose }: Props) {
  const { schedule, edit, undo } = useStore();
  const { toast } = useUI();
  const clock = schedule.settings.clock;
  const [query, setQuery] = useState('');
  const [room, setRoom] = useState('');
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<Option | null>(null);
  const [invalid, setInvalid] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const courseInput = useRef<HTMLInputElement>(null);
  const roomInput = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  useDismiss([popRef], onClose);

  // Float beside the new block on wide screens; dock as a bottom sheet on phones.
  const isSheet = window.innerWidth < 640;
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop || !anchor || isSheet) return;
    const margin = 12;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = r.right + 12;
    if (left + w > window.innerWidth - margin) left = r.left - 12 - w;
    if (left < margin) left = Math.min(Math.max(margin, r.left + r.width / 2 - w / 2), window.innerWidth - w - margin);
    const top = Math.min(Math.max(margin, r.top), window.innerHeight - h - margin);
    setPosition({ left, top });
  }, [anchor, isSheet]);

  // Focus once visible: a visibility:hidden input can't take focus.
  const visible = isSheet || position !== null;
  useEffect(() => {
    if (visible) courseInput.current?.focus({ preventScroll: true });
  }, [visible]);

  const q = query.trim().toLowerCase();
  const options = useMemo<Option[]>(() => {
    if (chosen) return [];
    const matches = schedule.courses
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, 6)
      .map((course): Option => ({ kind: 'course', course }));
    const exact = schedule.courses.some(
      (c) => c.code.toLowerCase() === q || c.title.toLowerCase() === q,
    );
    if (q && !exact) matches.push({ kind: 'new', ...parseCourseText(query) });
    return matches;
  }, [chosen, q, query, schedule.courses]);

  const choose = (option: Option) => {
    setChosen(option);
    setInvalid(false);
    setQuery(
      option.kind === 'course'
        ? [option.course.code, courseLabel(option.course)].filter(Boolean).join(' · ')
        : [option.code, option.title].filter(Boolean).join(' · '),
    );
    roomInput.current?.focus();
  };

  const submit = () => {
    const option = chosen ?? (q ? options[active] ?? options[0] : undefined);
    if (!option) {
      setInvalid(true);
      courseInput.current?.focus();
      return;
    }
    const meeting = { id: uid(), day: draft.day, start: draft.start, end: draft.end, room: room.trim() };
    let label: string;
    if (option.kind === 'course') {
      edit(addMeetings({ ...meeting, courseId: option.course.id }));
      label = courseLabel(option.course);
    } else {
      const course = newCourse(schedule, { code: option.code, title: option.title });
      edit((s) => addMeetings({ ...meeting, courseId: course.id })(addCourse(course)(s)));
      label = courseLabel(course);
    }
    toast({
      message: `Added ${label} · ${DAY_SHORT[draft.day]} ${formatRange(draft.start, draft.end, clock)}`,
      action: { label: 'Undo', run: undo },
    });
    onClose();
  };

  const onCourseKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!options.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) submit();
      else if (options[active]) choose(options[active]);
      else if (chosen) roomInput.current?.focus();
    }
  };

  const previewColor = chosen?.kind === 'course' ? chosen.course.color : nextColor(schedule.courses);

  return createPortal(
    <div
      ref={popRef}
      className={cx('popover', 'quick-add', isSheet && 'is-sheet')}
      style={isSheet ? undefined : (position ?? { visibility: 'hidden' })}
      role="dialog"
      aria-label="Add a class"
    >
      <div className="qa-when">
        <Clock3 aria-hidden />
        <span>
          <strong>{DAY_LONG[draft.day]}</strong> · {formatRange(draft.start, draft.end, clock)}
        </span>
        <span className="qa-duration">{formatDuration(draft.end - draft.start)}</span>
      </div>

      <label className={cx('qa-field', invalid && 'is-invalid')}>
        <span className="qa-dot" style={{ background: accentVar(previewColor) }} aria-hidden />
        <input
          ref={courseInput}
          value={query}
          placeholder={schedule.courses.length ? 'Search or create a course' : 'Course, e.g. (11055) Data Structures'}
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls="qa-options"
          aria-activedescendant={options.length ? `qa-opt-${active}` : undefined}
          aria-label="Course"
          onChange={(e) => {
            setQuery(e.target.value);
            setChosen(null);
            setActive(0);
            setInvalid(false);
          }}
          onKeyDown={onCourseKey}
        />
      </label>

      {options.length > 0 && (
        <ul className="qa-options" id="qa-options" role="listbox">
          {options.map((o, i) => (
            <li
              key={o.kind === 'course' ? o.course.id : 'new'}
              id={`qa-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={cx('qa-option', i === active && 'is-active')}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o.kind === 'course' ? (
                <>
                  <span className="swatch" style={{ background: accentVar(o.course.color) }} aria-hidden />
                  <span className="qa-option-title">{courseLabel(o.course)}</span>
                  {o.course.code && <span className="qa-option-code">{o.course.code}</span>}
                </>
              ) : (
                <>
                  <Plus className="qa-plus" aria-hidden />
                  <span className="qa-option-title">
                    Create <strong>{o.title || o.code}</strong>
                  </span>
                  {o.code && o.title && <span className="qa-option-code">{o.code}</span>}
                </>
              )}
              {i === active && <CornerDownLeft className="qa-enter" aria-hidden />}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={roomInput}
        className="input qa-room"
        value={room}
        placeholder="Room (optional)"
        aria-label="Room"
        onChange={(e) => setRoom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />

      <div className="qa-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={submit}>
          Add class
        </button>
      </div>
    </div>,
    document.body,
  );
}
