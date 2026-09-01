import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ClipDetailView } from "@/components/clip-detail-view";
import { avatarSrc } from "@/lib/avatar-url";
import { clipPosterSrc, clipVideoSrc } from "@/lib/clip-video-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

async function findPublishedClip(slug: string) {
  return prisma.clip.findFirst({
    where: { slug, published: true },
    include: {
      user: { include: { profile: true } },
      game: true,
      _count: { select: { comments: true } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const clip = await findPublishedClip(slug);
  if (!clip) return {};

  const title = `${clip.title} — Holdpoint`;
  const description = clip.caption ?? `${clip.user.displayName}'s clip on Holdpoint.`;
  // clip.thumbnailUrl is a storage key, not a fetchable URL (the bucket's
  // private) — same reason every other place this shows up goes through
  // clipPosterSrc first. Previously unreachable in practice since nothing
  // ever populated thumbnailUrl for a real upload; worth getting right now
  // that uploads set it for real.
  const posterSrc = clipPosterSrc(clip.thumbnailUrl);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: posterSrc ? [posterSrc] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: posterSrc ? [posterSrc] : undefined,
    },
  };
}

export default async function ClipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const clip = await findPublishedClip(slug);
  if (!clip) notFound();

  const reaction = await prisma.reaction.findMany({
    where: { userId: user.id, clipId: clip.id, emote: { in: ["like", "save"] } },
    select: { emote: true },
  });
  const liked = reaction.some((entry) => entry.emote === "like");
  const saved = reaction.some((entry) => entry.emote === "save");

  // Skipped entirely for your own clip — self-follow is rejected at the
  // action level anyway, and isOwnClip already hides the button.
  const isOwnClip = clip.userId === user.id;
  const [followingRow, followedByRow] = isOwnClip
    ? [null, null]
    : await Promise.all([
        prisma.follow.findUnique({
          where: { followerId_followedId: { followerId: user.id, followedId: clip.userId } },
        }),
        prisma.follow.findUnique({
          where: { followerId_followedId: { followerId: clip.userId, followedId: user.id } },
        }),
      ]);

  return (
    <ClipDetailView
      viewerId={user.id}
      clip={{
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
        liked,
        saved,
        following: Boolean(followingRow),
        followsViewer: Boolean(followedByRow),
      }}
    />
  );
}
