/** Wordmark and symbol. The mark is a capture point: a held objective. */

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="var(--color-line-strong)" strokeWidth="1.5" />
      <path d="M16 2 30 16 16 30" fill="none" stroke="var(--color-signal)" strokeWidth="2.5" />
      <rect x="12" y="12" width="8" height="8" fill="var(--color-signal)" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Mark size={compact ? 22 : 26} />
      {!compact && (
        <span className="display text-[1.05rem] tracking-[0.18em] uppercase">
          Hold<span className="text-signal">point</span>
        </span>
      )}
    </span>
  );
}
