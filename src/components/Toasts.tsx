import { CircleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx } from '../lib/cx.ts';
import { useUI, type Toast } from '../state/ui.tsx';

const LIFETIME = 5500;

export function Toasts() {
  const { toasts, dismissToast } = useUI();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss: dismissById }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const onDismiss = () => dismissById(toast.id);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => dismissById(toast.id), LIFETIME);
    return () => clearTimeout(t);
  }, [paused, dismissById, toast.id]);

  return (
    <div
      className={cx('toast', toast.tone === 'error' && 'is-error')}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {toast.tone === 'error' && <CircleAlert className="toast-icon" aria-hidden />}
      <span className="toast-msg">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        <X />
      </button>
    </div>
  );
}
