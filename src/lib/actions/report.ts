"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";
import { getCurrentUser } from "@/lib/session";

// The report dialog only ever offers these three — a clip, a community
// post, or a user — even though ReportTarget (schema.prisma) carries a few
// more values inherited from the original spec (CHAT_MESSAGE, COMMENT,
// TEAM, COMMUNITY, TOURNAMENT) that nothing in the app surfaces a report
// button for yet. Kept as a subset of the Prisma enum, not a redeclaration
// of it, so this can't silently drift from the schema.
const REPORTABLE_TARGETS = ["CLIP", "COMMUNITY_POST", "USER"] as const;
export type ReportableTarget = (typeof REPORTABLE_TARGETS)[number];

const REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]];

const reportInput = z.object({
  target: z.enum(REPORTABLE_TARGETS),
  targetId: z.string().min(1),
  reason: z.enum(REASON_VALUES),
  details: z.string().trim().max(500, "Keep it under 500 characters.").optional(),
});

export type ReportContentResult = { reported: true } | { error: string };

/**
 * Resolves the user ultimately accountable for `target`/`targetId` — the
 * clip's uploader, the post's author, or the reported user themselves —
 * and confirms the thing being reported still exists. Returns that user's
 * id, or an error if the target is gone or the reporter is reporting
 * their own content (nothing to moderate there; the delete/edit tools for
 * your own stuff already exist).
 */
async function resolveReportedUserId(
  target: ReportableTarget,
  targetId: string,
  reporterId: string,
): Promise<{ reportedId: string } | { error: string }> {
  switch (target) {
    case "CLIP": {
      const clip = await prisma.clip.findUnique({ where: { id: targetId }, select: { userId: true } });
      if (!clip) return { error: "That clip no longer exists." };
      if (clip.userId === reporterId) return { error: "You can't report your own clip." };
      return { reportedId: clip.userId };
    }
    case "COMMUNITY_POST": {
      const post = await prisma.communityPost.findUnique({
        where: { id: targetId },
        select: { authorId: true, deletedAt: true },
      });
      if (!post || post.deletedAt) return { error: "That post no longer exists." };
      if (post.authorId === reporterId) return { error: "You can't report your own post." };
      return { reportedId: post.authorId };
    }
    case "USER": {
      if (targetId === reporterId) return { error: "You can't report yourself." };
      const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!user) return { error: "That player no longer exists." };
      return { reportedId: user.id };
    }
  }
}

/**
 * Files a report against a clip, a community post, or a user. The reason
 * is checked against the same fixed list the dialog offers — a direct
 * call can't smuggle in an arbitrary string — and `reportedId` (see
 * resolveReportedUserId) is always derived server-side from the target,
 * never trusted from the client, so the moderation queue can rely on it
 * for a "suspend whoever's responsible" action regardless of target type.
 *
 * Duplicate reports (same reporter, same target) are a no-op error rather
 * than a second row — enforced by Report's own unique constraint
 * (@@unique([reporterId, target, targetId]) in schema.prisma), not just a
 * pre-check here, so a race between two identical requests can't slip
 * both through.
 */
export async function reportContentAction(
  target: ReportableTarget,
  targetId: string,
  reason: string,
  details?: string,
): Promise<ReportContentResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to report something." };

  const parsed = reportInput.safeParse({ target, targetId, reason, details });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid report." };

  const resolved = await resolveReportedUserId(parsed.data.target, parsed.data.targetId, user.id);
  if ("error" in resolved) return resolved;

  try {
    await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedId: resolved.reportedId,
        target: parsed.data.target,
        targetId: parsed.data.targetId,
        reason: parsed.data.reason,
        details: parsed.data.details || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "You've already reported this." };
    }
    throw error;
  }

  return { reported: true };
}
