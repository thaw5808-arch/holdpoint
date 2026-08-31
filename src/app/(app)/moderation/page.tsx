import { notFound, redirect } from "next/navigation";
import { ModerationQueue, type ModerationReportItem } from "@/components/moderation-queue";
import { avatarSrc } from "@/lib/avatar-url";
import { clipPosterSrc } from "@/lib/clip-video-url";
import { relativeTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MOD_ROLES = new Set(["MODERATOR", "ADMIN"]);

/**
 * Site-wide moderation queue — open reports, newest first, with the
 * reported content shown inline so a mod can judge without leaving the
 * page. Gated on User.role (MODERATOR/ADMIN), re-checked here even though
 * the sidebar link (see shell/sidebar.tsx) already hides itself from
 * anyone else — a page gate is the actual boundary, a hidden nav link
 * isn't. Every mutation this page's actions expose (dismiss/hide/suspend,
 * see @/lib/actions/moderation) re-checks the same role independently,
 * since this gate alone wouldn't stop a direct call to one of them.
 *
 * Signed out goes to /login like every other page in this app; signed in
 * but not a moderator gets a plain 404 rather than an "access denied" —
 * this page's existence isn't something worth confirming to a non-mod.
 */
export default async function ModerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!MOD_ROLES.has(user.role)) notFound();

  const reports = await prisma.report.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reporter: { select: { username: true, displayName: true, profile: { select: { avatarUrl: true } } } },
      reported: {
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          profile: { select: { avatarUrl: true } },
        },
      },
    },
  });

  // Report's target is polymorphic (see schema.prisma) — Prisma has no
  // native relation for "whichever table targetId points into", so the
  // actual reported content gets batch-fetched per target type below,
  // one query each, rather than one query per report.
  const clipIds = reports.filter((r) => r.target === "CLIP").map((r) => r.targetId);
  const postIds = reports.filter((r) => r.target === "COMMUNITY_POST").map((r) => r.targetId);

  const [clips, posts] = await Promise.all([
    clipIds.length > 0
      ? prisma.clip.findMany({
          where: { id: { in: clipIds } },
          select: {
            id: true,
            slug: true,
            title: true,
            caption: true,
            thumbnailUrl: true,
            published: true,
            user: { select: { username: true, displayName: true } },
          },
        })
      : Promise.resolve([]),
    postIds.length > 0
      ? prisma.communityPost.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            body: true,
            authorId: true,
            deletedAt: true,
            channel: { select: { name: true, community: { select: { name: true, slug: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  // CommunityPost.authorId has no Prisma relation to User (see
  // schema.prisma — same as its deletedById), so the author has to be
  // looked up separately, same as the community page itself does.
  const postAuthors =
    posts.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: posts.map((post) => post.authorId) } },
          select: { id: true, username: true, displayName: true },
        })
      : [];
  const postAuthorById = new Map(postAuthors.map((author) => [author.id, author]));

  const clipById = new Map(clips.map((clip) => [clip.id, clip]));
  const postById = new Map(posts.map((post) => [post.id, post]));

  const items: ModerationReportItem[] = reports.map((report) => {
    const base = {
      id: report.id,
      reason: report.reason,
      details: report.details,
      createdAt: relativeTime(report.createdAt),
      reporter: {
        displayName: report.reporter.displayName,
        username: report.reporter.username,
        avatarUrl: avatarSrc(report.reporter.profile?.avatarUrl),
      },
      reportedUser: report.reported
        ? {
            id: report.reported.id,
            displayName: report.reported.displayName,
            username: report.reported.username,
            avatarUrl: avatarSrc(report.reported.profile?.avatarUrl),
            status: report.reported.status,
          }
        : null,
    };

    if (report.target === "CLIP") {
      const clip = clipById.get(report.targetId);
      return {
        ...base,
        content: clip
          ? {
              kind: "CLIP",
              exists: true,
              slug: clip.slug,
              title: clip.title,
              caption: clip.caption,
              thumbnailUrl: clipPosterSrc(clip.thumbnailUrl),
              published: clip.published,
              uploaderDisplayName: clip.user.displayName,
              uploaderUsername: clip.user.username,
            }
          : { kind: "CLIP", exists: false },
      };
    }

    if (report.target === "COMMUNITY_POST") {
      const post = postById.get(report.targetId);
      const author = post ? postAuthorById.get(post.authorId) : undefined;
      return {
        ...base,
        content: post
          ? {
              kind: "COMMUNITY_POST",
              exists: true,
              body: post.body,
              deleted: post.deletedAt !== null,
              communityName: post.channel.community.name,
              communitySlug: post.channel.community.slug,
              channelName: post.channel.name,
              authorDisplayName: author?.displayName ?? "Member",
              authorUsername: author?.username ?? "unknown",
            }
          : { kind: "COMMUNITY_POST", exists: false },
      };
    }

    if (report.target === "USER") {
      return { ...base, content: { kind: "USER" } };
    }

    // Every other ReportTarget value (CHAT_MESSAGE, COMMENT, TEAM,
    // COMMUNITY, TOURNAMENT) is inherited from the original spec — no
    // report button in this app creates one, but the queue still has to
    // render *something* sane if one ever shows up some other way.
    return { ...base, content: { kind: "UNSUPPORTED", target: report.target } };
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="eyebrow mb-2">Moderation</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Report queue</h1>
      <p className="mb-6 text-sm text-muted">
        {items.length} open {items.length === 1 ? "report" : "reports"}, newest first.
      </p>

      <ModerationQueue items={items} />
    </div>
  );
}
