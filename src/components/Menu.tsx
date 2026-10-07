import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useDismiss } from '../hooks/useDismiss.ts';
import { cx } from '../lib/cx.ts';

interface MenuProps {
  /** Contents of the trigger button. */
  button: ReactNode;
  buttonClassName?: string;
  label: string;
  title?: string;
  align?: 'start' | 'end';
  className?: string;
  children: (close: () => void) => ReactNode;
}

export function Menu({ button, buttonClassName, label, title, align = 'end', className, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);
  const closeAndFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismiss([rootRef], close, open);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div className={cx('menu-root', className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName ?? 'btn btn-secondary'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {button}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          className={cx('popover', 'menu', align === 'end' ? 'is-end' : 'is-start')}
          onKeyDown={onKeyDown}
        >
          {children(closeAndFocus)}
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  onSelect: () => void;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export function MenuItem({ icon, children, hint, onSelect, checked, danger, disabled }: ItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className={cx('menu-item', danger && 'is-danger', checked && 'is-checked')}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="menu-icon" aria-hidden>
        {icon}
      </span>
      <span className="menu-label">{children}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  );
}

export const MenuSeparator = () => <div className="menu-sep" role="separator" />;

export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="menu-heading">{children}</div>;
