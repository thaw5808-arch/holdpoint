"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { reportContentAction, type ReportableTarget } from "@/lib/actions/report";
import { REPORT_REASONS } from "@/lib/report-reasons";

/**
 * Report confirmation dialog — shared by the clip rail, a community post's
 * row, and a profile page, the three surfaces that can report something.
 * Picking a reason is required; the note is not. Stays open after a
 * successful submit to show a short confirmation rather than vanishing
 * the instant it worked, same reasoning as ClipDeleteConfirm staying open
 * through its own pending state.
 */
export function ReportDialog({
  target,
  targetId,
  label,
  onClose,
}: {
  target: ReportableTarget;
  targetId: string;
  /** What this is, for the dialog's own copy — "clip", "post", "player". */
  label: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isPending]);

  const submit = () => {
    if (!reason) {
      setError("Pick a reason first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reportContentAction(target, targetId, reason, details.trim() || undefined);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-sm"
      onClick={() => !isPending && onClose()}
    >
      <div
        role="dialog"
        aria-label={`Report ${label}`}
        onClick={(event) => event.stopPropagation()}
        className="glass-strong w-full max-w-sm p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Report {label}</p>
          <button
            type="button"
            className="btn btn-ghost px-1.5"
            onClick={onClose}
            aria-label="Close"
            disabled={isPending}
          >
            <X size={16} />
          </button>
        </div>

        {submitted ? (
          <p className="text-sm text-muted">Thanks — we&rsquo;ve got it. A moderator will take a look.</p>
        ) : (
          <>
            <p className="mb-2 text-[0.75rem] text-faint">Why are you reporting this {label}?</p>
            <ul className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <li key={r.value}>
                  <button
                    type="button"
                    onClick={() => setReason(r.value)}
                    aria-pressed={reason === r.value}
                    disabled={isPending}
                    className={`flex w-full items-center border px-2.5 py-2 text-left text-sm transition-colors ${
                      reason === r.value
                        ? "border-signal text-signal"
                        : "border-line text-muted hover:border-line-strong"
                    }`}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>

            <label htmlFor="report-details" className="eyebrow mb-1.5 mt-3 block">
              Add a note (optional)
            </label>
            <textarea
              id="report-details"
              rows={3}
              maxLength={500}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              disabled={isPending}
              placeholder="Anything else a moderator should know?"
              className="input resize-none"
            />

            {error && (
              <p role="alert" className="mt-2 text-[0.75rem] text-live">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={onClose} disabled={isPending}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={isPending || !reason}
              >
                {isPending ? "Reporting…" : "Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
