"use client";

import { useState } from "react";
import { ClipTile, type ClipTileData } from "@/components/cards";
import { ClipDeleteConfirm } from "@/components/clip-delete-confirm";
import { EmptyState } from "@/components/ui";

export interface ProfileClip extends ClipTileData {
  id: string;
}

/**
 * Client wrapper around the profile page's clip strip, needed only so the
 * owner can delete one of their own clips from a card without a full page
 * reload — same "seed once, own it locally" approach as the feed's clip
 * list (see clip-feed.tsx). The delete button only ever renders when
 * `isOwnProfile` is true; deleteClipAction re-checks ownership regardless.
 */
export function ProfileClips({ clips, isOwnProfile }: { clips: ProfileClip[]; isOwnProfile: boolean }) {
  const [items, setItems] = useState(clips);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);
  const deleteConfirmClip = items.find((clip) => clip.id === deleteConfirmFor);

  if (items.length === 0) {
    // Only reachable by deleting the last clip client-side — the server
    // page itself only renders ProfileClips when there's at least one to
    // start with, falling back to this same message otherwise.
    return (
      <EmptyState
        title="No clips yet"
        body="Upload a clip and it'll show up here."
        action={{ href: "/clips/new", label: "Upload a clip" }}
      />
    );
  }

  return (
    <>
      <div className="scroll-x flex gap-3 pb-2">
        {items.map((clip) => (
          <ClipTile
            key={clip.id}
            clip={clip}
            onDeleteClick={isOwnProfile ? () => setDeleteConfirmFor(clip.id) : undefined}
          />
        ))}
      </div>

      {deleteConfirmClip && (
        <ClipDeleteConfirm
          clip={{ id: deleteConfirmClip.id, title: deleteConfirmClip.title }}
          onClose={() => setDeleteConfirmFor(null)}
          onDeleted={() => {
            setItems((current) => current.filter((clip) => clip.id !== deleteConfirmClip.id));
            setDeleteConfirmFor(null);
          }}
        />
      )}
    </>
  );
}
