/**
 * The fixed reason list a reporter picks from — shared between the report
 * dialog (renders these as options) and reportContentAction (validates
 * against the same list server-side, since a client calling the action
 * directly could send anything otherwise). Deliberately short: a long list
 * of hyper-specific reasons doesn't actually help a moderator triage
 * faster, and every option here applies equally well to a clip, a
 * community post, or a user.
 */
export const REPORT_REASONS = [
  { value: "SPAM", label: "Spam" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE_SPEECH", label: "Hate speech" },
  { value: "NSFW", label: "Sexual or graphic content" },
  { value: "MISINFORMATION", label: "Misinformation" },
  { value: "OTHER", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

const REASON_LABELS: Record<ReportReason, string> = Object.fromEntries(
  REPORT_REASONS.map(({ value, label }) => [value, label]),
) as Record<ReportReason, string>;

export function reportReasonLabel(reason: string): string {
  return REASON_LABELS[reason as ReportReason] ?? reason;
}
