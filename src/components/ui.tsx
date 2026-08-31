import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { compactNumber } from "@/lib/format";

export function LiveTag({ viewers }: { viewers?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-live/60 bg-live/12 px-1.5 py-0.5">
      <span className="live-dot h-1.5 w-1.5 bg-live" />
      <span className="display text-[0.625rem] uppercase tracking-[0.14em] text-live">Live</span>
      {viewers !== undefined && (
        <span className="tabular text-[0.625rem] text-live/80">{compactNumber(viewers)}</span>
      )}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "signal" | "gold" | "ice" | "quiet";
  className?: string;
}) {
  const tones = {
    neutral: "border-line-strong text-muted",
    signal: "border-signal/50 text-signal bg-signal/8",
    gold: "border-gold/45 text-gold bg-gold/8",
    ice: "border-ice/45 text-ice bg-ice/8",
    quiet: "border-line text-faint",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[0.6875rem] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Selectable pill for a checkbox/radio option hidden behind `sr-only` — pair
 * it with `checked`/JS state, not `peer-checked:`. `.btn`'s border/text
 * colour are plain (unlayered) CSS in globals.css, which always wins the
 * cascade over Tailwind's own utility classes, `peer-checked:*` included,
 * since those live inside Tailwind's layered utilities — so toggling
 * `.btn-primary` (also plain CSS) is what actually flips the fill. The
 * checkmark carries the "selected" signal on its own, so it does not
 * depend on that colour change either.
 */
export function OptionPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? "btn btn-primary" : "btn"}>
      {active && <Check size={12} aria-hidden />}
      {label}
    </span>
  );
}

/** Rank chip: chamfered, tier index drives the fill height of the notch. */
export function RankChip({
  tier,
  tierIdx,
  tierCount,
  role,
}: {
  tier: string;
  tierIdx: number;
  tierCount: number;
  role?: string | null;
}) {
  const fill = Math.round(((tierIdx + 1) / tierCount) * 100);
  return (
    <span className="chamfer-sm inline-flex items-center gap-2 border border-line-strong bg-raised px-2 py-1">
      <span className="relative h-4 w-1.5 bg-line">
        <span className="absolute bottom-0 left-0 w-full bg-signal" style={{ height: `${fill}%` }} />
      </span>
      <span className="display text-[0.6875rem] uppercase tracking-[0.08em]">{tier}</span>
      {role && <span className="text-[0.6875rem] text-faint">{role}</span>}
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="display text-lg uppercase tracking-[0.06em]">{title}</h2>
      </div>
      {action && (
        <Link href={action.href} className="btn btn-ghost text-[0.6875rem]">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="border border-dashed border-line px-6 py-10 text-center">
      <p className="display mb-2 text-base uppercase tracking-[0.06em]">{title}</p>
      <p className="mx-auto mb-5 max-w-sm text-sm text-muted">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "signal" | "gold";
}) {
  const accent =
    tone === "signal" ? "text-signal" : tone === "gold" ? "text-gold" : "text-text";
  return (
    <div className="border border-line bg-surface p-3">
      <p className="eyebrow mb-1.5">{label}</p>
      <p className={`display tabular text-xl ${accent}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[0.6875rem] text-faint">{sub}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function StreamCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-video w-full" />
      <div className="mt-2 flex gap-2">
        <Skeleton className="h-8 w-8" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
    </div>
  );
}
