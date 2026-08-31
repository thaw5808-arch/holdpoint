"use server";

import { revalidatePath } from "next/cache";
import type { User, UserRole } from "@prisma/client";
import { z } from "zod";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

const ROLES = ["VIEWER", "CREATOR", "ORGANIZER", "MODERATOR", "ADMIN"] as const;

/** Every action below re-checks this from the DB (via getCurrentUser, which
 * itself reads the session fresh — see session.ts) rather than trusting
 * anything the page passed down; the admin page's own gate (see
 * app/(app)/admin/users/page.tsx) and the sidebar link hiding itself from
 * non-admins are both UI niceties, not the authorization boundary — a
 * direct call to one of these still has to earn its way in from scratch.
 * Same shape as requireModerator() in moderation.ts. */
async function requireAdmin(): Promise<{ error: string } | { user: CurrentUser }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };
  if (user.role !== "ADMIN") return { error: "You don't have permission to do that." };
  return { user };
}

async function loadTarget(userId: string): Promise<{ error: string } | { target: User }> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "That account no longer exists." };
  return { target };
}

const roleChangeInput = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
});

export type ChangeUserRoleResult = { role: UserRole } | { error: string };

/**
 * Changes a user's platform role. Two invariants are enforced here, not in
 * the UI, because the UI graying out a button doesn't stop a direct call:
 *
 *  - An admin can't change their own role — otherwise an admin locks
 *    themselves in (or out) with no second party involved.
 *  - The last remaining ADMIN can't be demoted away from ADMIN — if this
 *    update would bring the ADMIN count to zero, nobody could open this
 *    screen again to undo it.
 *
 * Every change is written to AdminAction (see schema.prisma) with who did
 * it and when, same "attribute it" stance as the moderation queue's
 * Report.resolvedById.
 */
export async function changeUserRoleAction(userId: string, role: string): Promise<ChangeUserRoleResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const parsed = roleChangeInput.safeParse({ userId, role });
  if (!parsed.success) return { error: "Invalid role." };

  const loaded = await loadTarget(parsed.data.userId);
  if ("error" in loaded) return loaded;
  const { target } = loaded;

  if (target.id === auth.user.id) return { error: "You can't change your own role." };

  if (target.role === parsed.data.role) return { role: target.role };

  if (target.role === "ADMIN") {
    const remainingAdmins = await prisma.user.count({ where: { role: "ADMIN", id: { not: target.id } } });
    if (remainingAdmins === 0) {
      return { error: "Can't demote the last admin — promote someone else first." };
    }
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { role: parsed.data.role } }),
    prisma.adminAction.create({
      data: {
        userId: target.id,
        actedById: auth.user.id,
        kind: "ROLE_CHANGE",
        fromRole: target.role,
        toRole: parsed.data.role,
      },
    }),
  ]);

  revalidatePath("/admin/users");
  return { role: parsed.data.role };
}

const userIdInput = z.object({ userId: z.string().min(1) });

export type LiftSuspensionResult = { lifted: true } | { error: string };

/**
 * Restores a SUSPENDED account to ACTIVE. A suspended user's session
 * already stops authenticating on its very next request (getCurrentUser
 * rejects anything but ACTIVE), so this is what lets them back in.
 *
 * Writes an ACCOUNT_REINSTATED notification once ACTIVE — unlike the
 * suspension notification itself (which the user can't see until this
 * moment), this one lands somewhere they can actually read it on their
 * very next authenticated request.
 */
export async function liftSuspensionAction(userId: string): Promise<LiftSuspensionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const parsed = userIdInput.safeParse({ userId });
  if (!parsed.success) return { error: "Invalid account." };

  const loaded = await loadTarget(parsed.data.userId);
  if ("error" in loaded) return loaded;
  const { target } = loaded;

  if (target.status !== "SUSPENDED") return { error: "This account isn't suspended." };

  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { status: "ACTIVE" } }),
    prisma.adminAction.create({
      data: {
        userId: target.id,
        actedById: auth.user.id,
        kind: "SUSPENSION_LIFTED",
        fromStatus: target.status,
        toStatus: "ACTIVE",
      },
    }),
  ]);

  await notify({
    userId: target.id,
    kind: "ACCOUNT_REINSTATED",
    title: "Your suspension was lifted",
    body: "Your account is active again — you have full access back.",
    href: "/home",
  });

  revalidatePath("/admin/users");
  return { lifted: true };
}
