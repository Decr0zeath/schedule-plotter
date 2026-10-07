import type { ColorKey, Course } from './types.ts';

/**
 * Categorical course colors, in their fixed assignment order. The order is what
 * keeps neighbouring slots distinguishable under colour-vision deficiency, so new
 * courses always take the next slot rather than a random one. The hex values for
 * each theme live in tokens.css (--cat-*).
 */
export const SERIES: readonly { key: ColorKey; label: string }[] = [
  { key: 'blue', label: 'Blue' },
  { key: 'orange', label: 'Orange' },
  { key: 'aqua', label: 'Aqua' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'green', label: 'Green' },
  { key: 'violet', label: 'Violet' },
  { key: 'red', label: 'Red' },
];

/** A neutral swatch for non-class blocks (consultation hours, breaks, …). */
export const SWATCHES: readonly { key: ColorKey; label: string }[] = [
  ...SERIES,
  { key: 'gray', label: 'Gray' },
];

export function isColorKey(value: unknown): value is ColorKey {
  return SWATCHES.some((s) => s.key === value);
}

/** The first slot in order that is used the fewest times. */
export function nextColor(courses: readonly Course[]): ColorKey {
  const counts = new Map<ColorKey, number>();
  for (const c of courses) counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
  let best: ColorKey = SERIES[0].key;
  let bestCount = Infinity;
  for (const s of SERIES) {
    const n = counts.get(s.key) ?? 0;
    if (n < bestCount) {
      best = s.key;
      bestCount = n;
    }
  }
  return best;
}

export const accentVar = (key: ColorKey) => `var(--cat-${key})`;
