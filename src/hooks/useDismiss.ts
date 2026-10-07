import { useEffect, type RefObject } from 'react';

/** Calls onDismiss on Escape or on a pointer press outside every given element. */
export function useDismiss(
  refs: RefObject<HTMLElement | null>[],
  onDismiss: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    };
    // Capture phase so the press that opens something else still closes this first.
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [active, onDismiss]);
}
