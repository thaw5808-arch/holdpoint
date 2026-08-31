"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Ban, Check, EyeOff } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Thumb } from "@/components/cards";
import { Pill } from "@/components/ui";
import {
  dismissReportAction,
  hideReportedContentAction,
  suspendReportedUserAction,
} from "@/lib/actions/moderation";
import { reportReasonLabel } from "@/lib/report-reasons";

interface Person {
  displayName: string;
  username: string;
  avatarUrl?: string | null;
}

type ReportedContent =
  | { kind: "CLIP"; exists: false }
  | {
      kind: "CLIP";
      exists: true;
      slug: string;
      title: string;
      caption: string | null;
      thumbnailUrl?: string | null;
      published: boolean;
      uploaderDisplayName: string;
      uploaderUsername: string;
    }
  | { kind: "COMMUNITY_POST"; exists: false }
  | {
      kind: "COMMUNITY_POST";
      exists: true;
      body: string;
      deleted: boolean;
      communityName: string;
      communitySlug: string;
      channelName: string;
      authorDisplayName: string;
      authorUsername: string;
    }
  | { kind: "USER" }
  | { kind: "UNSUPPORTED"; target: string };

export interface ModerationReportItem {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string; // pre-formatted relative time
  reporter: Person;
  reportedUser: (Person & { id: string; status: string }) | null;
  content: ReportedContent;
}

/** Inline preview of whatever the report points at — the whole reason a
 * mod shouldn't have to leave this page to judge a report. */
function ContentPreview({ content }: { content: ReportedContent }) {
  switch (content.kind) {
    case "CLIP":
      if (!content.exists) return <p className="text-sm text-faint">This clip no longer exists.</p>;
      return (
        <Link
          href={`/clips/${content.slug}`}
          target="_blank"
          className="tick flex gap-3 border border-line bg-raised p-2.5 hover:border-line-strong"
        >
          {content.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={content.thumbnailUrl} alt="" className="h-20 w-[45px] shrink-0 bg-ink object-cover" />
          ) : (
            <Thumb seed={content.slug} className="h-20 w-[45px] shrink-0" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm">{content.title}</span>
            {content.caption && (
              <span className="mt-0.5 block truncate text-[0.75rem] text-muted">{content.caption}</span>
            )}
            <span className="mt-1 block text-[0.6875rem] text-faint">
              by {content.uploaderDisplayName} (@{content.uploaderUsername})
              {!content.published && " · already hidden"}
            </span>
          </span>
        </Link>
      );
    case "COMMUNITY_POST":
      if (!content.exists) return <p className="text-sm text-faint">This post no longer exists.</p>;
      return (
        <div className="border border-line bg-raised p-2.5">
          <p className="text-[0.6875rem] text-faint">
            {content.communityName} · #{content.channelName} · {content.authorDisplayName} (@
            {content.authorUsername}){content.deleted && " · already deleted"}
          </p>
          <p className="mt-1 text-sm text-muted">{content.body}</p>
        </div>
      );
    case "USER":
      return null; // the reportedUser card below already covers it
    case "UNSUPPORTED":
      return <p className="text-sm text-faint">Unsupported report type ({content.target}) — review manually.</p>;
  }
}

function ReportRow({ item, onResolved }: { item: ModerationReportItem; onResolved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Three near-identical handlers rather than one generic runner — each
  // action's result is its own named type ({dismissed:true}|{error},
  // {hidden:true}|{error}, {suspended:true}|{error}), same pattern as the
  // rest of this codebase's action wiring (e.g. toggleLike/toggleSave in
  // clip-feed.tsx), which keeps each call's success/error narrowing exact
  // instead of forcing them through a shared loose shape.
  const handleDismiss = () => {
    setError(null);
    startTransition(async () => {
      const result = await dismissReportAction(item.id);
      if ("error" in result) setError(result.error);
      else onResolved();
    });
  };

  const handleHide = () => {
    setError(null);
    startTransition(async () => {
      const result = await hideReportedContentAction(item.id);
      if ("error" in result) setError(result.error);
      else onResolved();
    });
  };

  const handleSuspend = () => {
    setError(null);
    startTransition(async () => {
      const result = await suspendReportedUserAction(item.id);
      if ("error" in result) setError(result.error);
      else onResolved();
    });
  };

  const canHide =
    (item.content.kind === "CLIP" && item.content.exists && item.content.published) ||
    (item.content.kind === "COMMUNITY_POST" && item.content.exists && !item.content.deleted);
  const canSuspend = item.reportedUser !== null && item.reportedUser.status !== "SUSPENDED";

  return (
    <li className="border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={item.reporter.displayName} seed={item.reporter.username} size={24} avatarUrl={item.reporter.avatarUrl} />
        <p className="text-sm">
          <Link href={`/u/${item.reporter.username}`} className="hover:text-signal" target="_blank">
            {item.reporter.displayName}
          </Link>{" "}
          <span className="text-muted">reported this</span>
        </p>
        <span className="tabular text-[0.6875rem] text-faint">{item.createdAt}</span>
        <Pill tone="signal" className="ml-auto">
          {reportReasonLabel(item.reason)}
        </Pill>
      </div>

      {item.details && <p className="mt-2 text-sm text-muted">&ldquo;{item.details}&rdquo;</p>}

      <div className="mt-3">
        <ContentPreview content={item.content} />
      </div>

      {item.reportedUser && (
        <div className="mt-2 flex items-center gap-2 border border-line bg-raised p-2">
          <Avatar
            name={item.reportedUser.displayName}
            seed={item.reportedUser.username}
            size={24}
            avatarUrl={item.reportedUser.avatarUrl}
          />
          <span className="min-w-0 flex-1">
            <Link href={`/u/${item.reportedUser.username}`} className="text-sm hover:text-signal" target="_blank">
              {item.reportedUser.displayName}
            </Link>
            <span className="ml-1.5 text-[0.6875rem] text-faint">accountable user</span>
          </span>
          {item.reportedUser.status !== "ACTIVE" && (
            <Pill tone="quiet">{item.reportedUser.status.toLowerCase()}</Pill>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[0.75rem] text-live">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={isPending}
          onClick={handleDismiss}
        >
          <Check size={14} /> Dismiss
        </button>
        {canHide && (
          <button
            type="button"
            className="btn"
            disabled={isPending}
            onClick={handleHide}
          >
            <EyeOff size={14} /> Hide content
          </button>
        )}
        {canSuspend && (
          <button
            type="button"
            className="btn border-live/60 text-live hover:bg-live/10"
            disabled={isPending}
            onClick={handleSuspend}
          >
            <Ban size={14} /> Suspend user
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Owns the open-reports list client-side so acting on one removes it
 * immediately — same "seed once from props, own it locally" approach as
 * the clip feed's own list (see clip-feed.tsx). A resolved report simply
 * stops being OPEN, so there's nothing to re-sync against afterward.
 */
export function ModerationQueue({ items }: { items: ModerationReportItem[] }) {
  const [reports, setReports] = useState(items);

  if (reports.length === 0) {
    return <p className="border border-dashed border-line px-6 py-10 text-center text-sm text-muted">Nothing open — the queue is clear.</p>;
  }

  return (
    <ul className="space-y-3">
      {reports.map((item) => (
        <ReportRow
          key={item.id}
          item={item}
          onResolved={() => setReports((current) => current.filter((r) => r.id !== item.id))}
        />
      ))}
    </ul>
  );
}
