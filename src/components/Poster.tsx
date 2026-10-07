import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { downloadUrl, slugify } from '../lib/download.ts';
import { layoutDay } from '../lib/layout.ts';
import { accentVar } from '../lib/palette.ts';
import { courseLabel, visibleRange } from '../lib/schedule.ts';
import { describeMeetings, minutesByCourse, summarize } from '../lib/stats.ts';
import { DAY_LONG, clamp, formatDuration, formatHour, formatHours } from '../lib/time.ts';
import type { Schedule } from '../lib/types.ts';
import { useStore } from '../state/store.tsx';
import { useUI } from '../state/ui.tsx';
import { EventContent } from './EventContent.tsx';

interface PosterProps {
  schedule: Schedule;
  theme: 'light' | 'dark';
  variant: 'image' | 'print';
}

/** A clean, chrome-free rendering of the week for PNG export and printing. */
export function Poster({ schedule, theme, variant }: PosterProps) {
  const range = visibleRange(schedule);
  const hours = (range.end - range.start) / 60;
  const hourPx = variant === 'print' ? clamp(520 / hours, 26, 56) : 58;
  const days = schedule.settings.days;
  const clock = schedule.settings.clock;
  const summary = summarize(schedule);
  const perCourse = minutesByCourse(schedule.meetings);
  const courses = new Map(schedule.courses.map((c) => [c.id, c]));
  const columns = `repeat(${days.length}, minmax(0, 1fr))`;
  const y = (m: number) => ((m - range.start) / 60) * hourPx;
  const hourMarks = Array.from({ length: hours + 1 }, (_, i) => range.start / 60 + i);
  const rooms = (courseId: string) =>
    [...new Set(schedule.meetings.filter((m) => m.courseId === courseId && m.room).map((m) => m.room))].join(', ');

  return (
    <div className={`poster is-${variant}`} data-theme={theme} style={{ '--hour': `${hourPx}px` } as CSSProperties}>
      <header className="poster-head">
        <div>
          {schedule.owner && <div className="poster-owner">{schedule.owner}</div>}
          <h1 className="poster-title">{schedule.title || 'Class Schedule'}</h1>
        </div>
        <div className="poster-term">
          {schedule.term && <div className="poster-term-label">{schedule.term}</div>}
          <div className="poster-totals">
            {formatHours(summary.totalMinutes)} hours a week · {summary.courseCount} course
            {summary.courseCount === 1 ? '' : 's'}
          </div>
        </div>
      </header>

      <div className="poster-grid">
        <div className="poster-days" style={{ gridTemplateColumns: `var(--gutter) ${columns}` }}>
          <span />
          {days.map((d) => (
            <span key={d}>{DAY_LONG[d]}</span>
          ))}
        </div>
        <div className="poster-body" style={{ height: hours * hourPx }}>
          <div className="poster-gutter">
            {hourMarks.map((h) => (
              <span key={h} style={{ top: y(h * 60) }}>
                {formatHour(h, clock)}
              </span>
            ))}
          </div>
          <div className="poster-cols" style={{ gridTemplateColumns: columns }}>
            {days.map((d) => (
              <div key={d} className="poster-col">
                {layoutDay(schedule.meetings.filter((m) => m.day === d)).map((p) => {
                  const course = courses.get(p.meeting.courseId);
                  if (!course) return null;
                  const height = (p.meeting.end - p.meeting.start) * (hourPx / 60);
                  return (
                    <div
                      key={p.meeting.id}
                      className="ev is-static"
                      style={
                        {
                          top: y(p.meeting.start) + 1,
                          height: height - 2,
                          left: `calc(${(p.col / p.cols) * 100}% + 3px)`,
                          width: `calc(${100 / p.cols}% - 6px)`,
                          '--accent': accentVar(course.color),
                        } as CSSProperties
                      }
                    >
                      <EventContent course={course} meeting={p.meeting} height={height} clock={clock} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {schedule.courses.length > 0 && (
        <table className="poster-legend">
          <thead>
            <tr>
              <th scope="col">Course</th>
              <th scope="col">Code</th>
              <th scope="col">Meets</th>
              <th scope="col">Room</th>
              <th scope="col">Weekly</th>
            </tr>
          </thead>
          <tbody>
            {schedule.courses.map((c) => (
              <tr key={c.id} style={{ '--accent': accentVar(c.color) } as CSSProperties}>
                <td>
                  <span className="course-dot" /> {courseLabel(c)}
                </td>
                <td className="mono">{c.code}</td>
                <td>{describeMeetings(schedule.meetings.filter((m) => m.courseId === c.id), clock)}</td>
                <td>{rooms(c.id)}</td>
                <td className="num">{formatDuration(perCourse.get(c.id) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <footer className="poster-foot">
        Updated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </footer>
    </div>
  );
}

/** Keeps a print copy ready and renders a PNG copy on request. */
export function PosterHost() {
  const { schedule } = useStore();
  const ui = useUI();
  const [rendering, setRendering] = useState(false);
  const handled = useRef(ui.posterRequest);
  const busy = useRef(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ui.posterRequest === handled.current) return;
    handled.current = ui.posterRequest;
    setRendering(true);
  }, [ui.posterRequest]);

  useEffect(() => {
    if (!rendering || busy.current) return;
    busy.current = true;
    void (async () => {
      try {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(r));
        const node = nodeRef.current;
        if (!node) throw new Error('nothing to render');
        const { toPng } = await import('html-to-image');
        const poster = node.firstElementChild as HTMLElement;
        const url = await toPng(node, {
          pixelRatio: 2,
          backgroundColor: getComputedStyle(poster).backgroundColor,
        });
        downloadUrl(url, `${slugify(schedule.term || schedule.title)}.png`);
        ui.toast({ message: 'Image saved.' });
      } catch (e) {
        ui.toast({ message: `Couldn't render the image (${(e as Error).message}).`, tone: 'error' });
      } finally {
        busy.current = false;
        setRendering(false);
      }
    })();
  }, [rendering, schedule, ui]);

  const printCopy = useMemo(() => <Poster schedule={schedule} theme="light" variant="print" />, [schedule]);

  return (
    <>
      <div className="poster-print">{printCopy}</div>
      {rendering && (
        <div className="poster-offscreen" aria-hidden>
          <div ref={nodeRef}>
            <Poster schedule={schedule} theme={ui.theme.resolved} variant="image" />
          </div>
        </div>
      )}
    </>
  );
}
