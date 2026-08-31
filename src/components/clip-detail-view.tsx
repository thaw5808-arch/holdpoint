"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { ClipCommentsPanel } from "@/components/clip-comments-panel";
import { ClipDeleteConfirm } from "@/components/clip-delete-confirm";
import { ClipShareSheet } from "@/components/clip-share-sheet";
import { ClipStage, type ClipStageClip } from "@/components/clip-stage";
import { ReportDialog } from "@/components/report-dialog";
import { SectionHeader } from "@/components/ui";
import { toggleClipLikeAction, toggleClipSaveAction } from "@/lib/actions/clip";

export interface DetailClip extends ClipStageClip {
  id: string;
  userId: string;
  likes: number;
  saves: number;
  comments: number;
  liked: boolean;
  saved: boolean;
}

/**
 * Single-clip page: the same 9:16 stage the feed uses, plus its comment
 * thread rendered inline below rather than behind a panel — there's no
 * feed here to stay in, so there's nothing the panel would be floating
 * over. Like/save state is optimistic-with-rollback, same pattern as
 * ClipFeed, just scoped to one clip instead of a map keyed by id.
 */
export function ClipDetailView({ clip, viewerId }: { clip: DetailClip; viewerId: string }) {
  const router = useRouter();
  const [reaction, setReaction] = useState({ liked: clip.liked, likes: clip.likes, saved: clip.saved, saves: clip.saves });
  const [commentCount, setCommentCount] = useState(clip.comments);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [, startTransition] = useTransition();
  const isOwnClip = clip.userId === viewerId;

  const toggleLike = () => {
    const previous = reaction;
    setReaction((state) => ({ ...state, liked: !state.liked, likes: state.likes + (state.liked ? -1 : 1) }));
    startTransition(async () => {
      const result = await toggleClipLikeAction(clip.id);
      setReaction((state) => ("error" in result ? previous : { ...state, liked: result.active, likes: result.count }));
    });
  };

  const toggleSave = () => {
    const previous = reaction;
    setReaction((state) => ({ ...state, saved: !state.saved, saves: state.saves + (state.saved ? -1 : 1) }));
    startTransition(async () => {
      const result = await toggleClipSaveAction(clip.id);
      setReaction((state) => ("error" in result ? previous : { ...state, saved: result.active, saves: result.count }));
    });
  };

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <Link href="/clips" className="btn btn-ghost mb-5">
        <ArrowLeft size={15} /> Back to clips
      </Link>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <div className="mx-auto w-full max-w-[380px]">
          <ClipStage
            clip={clip}
            maxWidthPx={380}
            isOwnClip={isOwnClip}
            reaction={reaction}
            commentCount={commentCount}
            onToggleLike={toggleLike}
            onToggleSave={toggleSave}
            onShare={() => setShareOpen(true)}
            shareActive={shareOpen}
            onDelete={() => setDeleteConfirmOpen(true)}
            deleteActive={deleteConfirmOpen}
            onReport={() => setReportDialogOpen(true)}
            reportActive={reportDialogOpen}
            onCommentsClick={() =>
              document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
        </div>

        <section id="comments">
          <SectionHeader eyebrow={`${commentCount} comments`} title="Comments" />
          <ClipCommentsPanel
            clipId={clip.id}
            viewerId={viewerId}
            variant="inline"
            onCountChange={(delta) => setCommentCount((count) => count + delta)}
          />
        </section>
      </div>

      {shareOpen && (
        <ClipShareSheet clip={{ id: clip.id, slug: clip.slug, title: clip.title }} onClose={() => setShareOpen(false)} />
      )}

      {deleteConfirmOpen && (
        <ClipDeleteConfirm
          clip={{ id: clip.id, title: clip.title }}
          onClose={() => setDeleteConfirmOpen(false)}
          // No feed to fall back into here (this is the single-clip page)
          // — send the viewer back to the feed instead, the way deleting
          // any other single-item page usually returns to its list.
          onDeleted={() => router.push("/clips")}
        />
      )}

      {reportDialogOpen && (
        <ReportDialog target="CLIP" targetId={clip.id} label="clip" onClose={() => setReportDialogOpen(false)} />
      )}
    </div>
  );
}
