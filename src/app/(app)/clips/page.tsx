import { redirect } from "next/navigation";
import { ClipFeed } from "@/components/clip-feed";
import { EmptyState } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { clipPosterSrc, clipVideoSrc } from "@/lib/clip-video-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function ClipsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const clips = await prisma.clip.findMany({
    where: { published: true },
    include: {
      user: { include: { profile: true } },
      game: true,
      _count: { select: { comments: true } },
    },
    orderBy: [{ views: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  if (clips.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          title="No clips yet"
          body="Nobody's uploaded a clip yet. Be the first — upload one and the feed starts here."
          action={{ href: "/clips/new", label: "Upload a clip" }}
        />
      </div>
    );
  }

  // The viewer's own like/save state, so a returning viewer sees their
  // prior reactions reflected instead of every clip starting unliked.
  const viewerReactions = await prisma.reaction.findMany({
    where: { userId: user.id, clipId: { in: clips.map((clip) => clip.id) }, emote: { in: ["like", "save"] } },
    select: { clipId: true, emote: true },
  });
  const likedClipIds = new Set(
    viewerReactions.filter((reaction) => reaction.emote === "like").map((reaction) => reaction.clipId),
  );
  const savedClipIds = new Set(
    viewerReactions.filter((reaction) => reaction.emote === "save").map((reaction) => reaction.clipId),
  );

  return (
    <ClipFeed
      viewerId={user.id}
      clips={clips.map((clip) => ({
        id: clip.id,
        userId: clip.userId,
        slug: clip.slug,
        title: clip.title,
        caption: clip.caption,
        displayName: clip.user.displayName,
        username: clip.user.username,
        avatarUrl: avatarSrc(clip.user.profile?.avatarUrl),
        game: clip.game?.shortName ?? null,
        views: clip.views,
        playbackUrl: clipVideoSrc(clip.playbackUrl),
        posterUrl: clipPosterSrc(clip.thumbnailUrl),
        likes: clip.likes,
        saves: clip.saves,
        comments: clip._count.comments,
        liked: likedClipIds.has(clip.id),
        saved: savedClipIds.has(clip.id),
      }))}
    />
  );
}
