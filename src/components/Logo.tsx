export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width="32" height="32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <rect x="7" y="7" width="5" height="11" rx="1.6" fill="var(--cat-blue)" />
      <rect x="13.5" y="12" width="5" height="13" rx="1.6" fill="var(--cat-orange)" />
      <rect x="20" y="7" width="5" height="8" rx="1.6" fill="var(--cat-aqua)" />
      <rect x="20" y="17" width="5" height="8" rx="1.6" fill="var(--cat-yellow)" />
    </svg>
  );
}
