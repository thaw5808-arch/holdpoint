"use server";

import { revalidatePath } from "next/cache";
import type { Report } from "@prisma/client";
import { z } from "zod";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

// Platform-level moderation — a User.role of MODERATOR or ADMIN — not to
// be confused with CommunityMember.role's own MODERATOR (a per-community
// standing checked in community.ts). This is the site-wide queue.
const MOD_ROLES = new Set(["MODERATOR", "ADMIN"]);

/** Every action below re-checks this from the DB (via getCurrentUser,
 * which itself reads the session fresh — see session.ts) rather than
 * trusting anything the page passed down; the queue page only hiding
 * itself from a non-mod is a UI nicety, not the authorization boundary. */
async function requireModerator(): Promise<{ error: string } | { user: CurrentUser }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };
  if (!MOD_ROLES.has(user.role)) return { error: "You don't have permission to do that." };
  return { user };
}

const reportIdInput = z.object({ reportId: z.string().min(1) });

/** Loads an OPEN report or explains why the action can't proceed —
 * shared by all three actions below so "already resolved" and "doesn't
 * exist" fail the same way regardless of which button triggered it (e.g.
 * two moderators racing to act on the same report). */
async function loadOpenReport(reportId: string): Promise<{ error: string } | { report: Report }> {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return { error: "That report no longer exists." };
  if (report.status !== "OPEN") return { error: "That report has already been resolved." };
  return { report };
}

export type DismissReportResult = { dismissed: true } | { error: string };

/** Closes a report with no action against its content or reporting user
 * — a moderator judged it not actionable. */
export async function dismissReportAction(reportId: string): Promise<DismissReportResult> {
  const auth = await requireModerator();
  if ("error" in auth) return auth;

  const parsed = reportIdInput.safeParse({ reportId });
  if (!parsed.success) return { error: "Invalid report." };

  const loaded = await loadOpenReport(parsed.data.reportId);
  if ("error" in loaded) return loaded;

  await prisma.report.update({
    where: { id: loaded.report.id },
    data: { status: "DISMISSED", resolvedAt: new Date(), resolvedById: auth.user.id },
  });

  revalidatePath("/moderation");
  return { dismissed: true };
}

export type HideReportedContentResult = { hidden: true } | { error: string };

/**
 * Hides the reported content using whichever soft-delete that content
 * type already has — Clip.published for a clip, CommunityPost.deletedAt/
 * deletedById for a post (same fields deleteCommunityPostAction sets, so
 * a moderator-hidden post is indistinguishable in the DB from an
 * author-deleted one, just attributed to the moderator instead). Only
 * valid for the two content targets; a USER report has no content of its
 * own to hide — see suspendReportedUserAction for that case.
 *
 * The content's owner gets a CONTENT_HIDDEN notification once this
 * actually changes something — deliberately worded plainly ("your clip
 * was hidden for violating community guidelines") with no mention of the
 * report, the reason, or who filed it: telling someone exactly who
 * reported them is an invitation to retaliate, not a transparency win.
 */
export async function hideReportedContentAction(reportId: string): Promise<HideReportedContentResult> {
  const auth = await requireModerator();
  if ("error" in auth) return auth;

  const parsed = reportIdInput.safeParse({ reportId });
  if (!parsed.success) return { error: "Invalid report." };

  const loaded = await loadOpenReport(parsed.data.reportId);
  if ("error" in loaded) return loaded;
  const { report } = loaded;

  // Set only when this call actually hides something — not when the
  // content is already gone/hidden (nothing changed, nothing to notify
  // about) or doesn't exist any more.
  let hiddenContent: { userId: string; kind: "CLIP" | "COMMUNITY_POST"; href: string } | null = null;

  if (report.target === "CLIP") {
    const clip = await prisma.clip.findUnique({
      where: { id: report.targetId },
      select: { id: true, userId: true, published: true, user: { select: { username: true } } },
    });
    if (clip?.published) {
      await prisma.clip.update({ where: { id: clip.id }, data: { published: false } });
      // Not /clips/[slug] — that route only ever renders published clips
      // (see clips/[slug]/page.tsx), so a link straight to the now-hidden
      // clip would 404 for the very person reading the notification.
      hiddenContent = { userId: clip.userId, kind: "CLIP", href: `/u/${clip.user.username}` };
    }
  } else if (report.target === "COMMUNITY_POST") {
    const post = await prisma.communityPost.findUnique({
      where: { id: report.targetId },
      select: {
        id: true,
        authorId: true,
        deletedAt: true,
        channel: { select: { community: { select: { slug: true } } } },
      },
    });
    if (post && post.deletedAt === null) {
      await prisma.communityPost.update({
        where: { id: post.id },
        data: { deletedAt: new Date(), deletedById: auth.user.id },
      });
      hiddenContent = { userId: post.authorId, kind: "COMMUNITY_POST", href: `/communities/${post.channel.community.slug}` };
    }
  } else {
    return { error: "This report has no content to hide — suspend the user instead." };
  }

  await prisma.report.update({
    where: { id: report.id },
    data: { status: "ACTIONED", resolvedAt: new Date(), resolvedById: auth.user.id },
  });

  if (hiddenContent) {
    await notify({
      userId: hiddenContent.userId,
      kind: "CONTENT_HIDDEN",
      title: "A moderator hid your content",
      body:
        hiddenContent.kind === "CLIP"
          ? "One of your clips was hidden for violating community guidelines."
          : "One of your community posts was hidden for violating community guidelines.",
      href: hiddenContent.href,
    });
  }

  // The hidden clip/post disappears from feeds, profiles, and channels —
  // all of which sit under this same revalidation as everywhere else in
  // this codebase that mutates shared content.
  revalidatePath("/", "layout");
  revalidatePath("/moderation");
  return { hidden: true };
}

export type SuspendReportedUserResult = { suspended: true } | { error: string };

/**
 * Suspends the user accountable for the report (report.reportedId —
 * resolved once, at report time, to whoever uploaded the clip, wrote the
 * post, or is the reported user themselves; see resolveReportedUserId in
 * report.ts) via the existing AccountStatus field. A suspended user's
 * live session stops authenticating on its very next request —
 * getCurrentUser already rejects anything but ACTIVE — so this takes
 * effect immediately, no separate session teardown needed.
 *
 * Also writes an ACCOUNT_SUSPENDED notification, same "plainly, no
 * reporter identity" wording as hideReportedContentAction above. Worth
 * noting: since suspension breaks auth immediately, the suspended user
 * can't actually see this until an admin lifts it and they log back in —
 * it's still worth writing now rather than only on reinstatement, so the
 * record (and its timestamp) reflects when the suspension actually
 * happened.
 */
export async function suspendReportedUserAction(reportId: string): Promise<SuspendReportedUserResult> {
  const auth = await requireModerator();
  if ("error" in auth) return auth;

  const parsed = reportIdInput.safeParse({ reportId });
  if (!parsed.success) return { error: "Invalid report." };

  const loaded = await loadOpenReport(parsed.data.reportId);
  if ("error" in loaded) return loaded;
  const { report } = loaded;

  if (!report.reportedId) return { error: "This report has no user attached to suspend." };
  if (report.reportedId === auth.user.id) return { error: "You can't suspend yourself." };

  await prisma.user.update({ where: { id: report.reportedId }, data: { status: "SUSPENDED" } });

  await prisma.report.update({
    where: { id: report.id },
    data: { status: "ACTIONED", resolvedAt: new Date(), resolvedById: auth.user.id },
  });

  await notify({
    userId: report.reportedId,
    kind: "ACCOUNT_SUSPENDED",
    title: "Your account was suspended",
    body: "Your account was suspended for violating community guidelines.",
    href: "/home",
  });

  revalidatePath("/", "layout");
  revalidatePath("/moderation");
  return { suspended: true };
}
