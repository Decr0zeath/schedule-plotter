import type { Meeting } from './types.ts';

export interface Placed {
  meeting: Meeting;
  /** Column within its overlap cluster. */
  col: number;
  /** Number of columns in its overlap cluster. */
  cols: number;
  conflict: boolean;
}

export const overlaps = (a: Meeting, b: Meeting) =>
  a.day === b.day && a.start < b.end && b.start < a.end;

/**
 * Lays out one day's meetings: overlapping meetings share the column width
 * side by side, and each is flagged as a conflict.
 */
export function layoutDay(meetings: readonly Meeting[]): Placed[] {
  const sorted = [...meetings].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id),
  );
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const p of cluster) p.cols = columnEnds.length;
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const meeting of sorted) {
    if (meeting.start >= clusterEnd) closeCluster();
    let col = columnEnds.findIndex((end) => end <= meeting.start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(meeting.end);
    } else {
      columnEnds[col] = meeting.end;
    }
    const p: Placed = { meeting, col, cols: 1, conflict: false };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, meeting.end);
  }
  closeCluster();

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (overlaps(placed[i].meeting, placed[j].meeting)) {
        placed[i].conflict = true;
        placed[j].conflict = true;
      }
    }
  }
  return placed;
}

export function findConflicts(meetings: readonly Meeting[]): [Meeting, Meeting][] {
  const sorted = [...meetings].sort((a, b) => a.day - b.day || a.start - b.start);
  const pairs: [Meeting, Meeting][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].day === sorted[i].day; j++) {
      if (overlaps(sorted[i], sorted[j])) pairs.push([sorted[i], sorted[j]]);
    }
  }
  return pairs;
}
