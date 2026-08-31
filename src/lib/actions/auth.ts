"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, getCurrentSessionId, getCurrentUser, safeReturnTo } from "@/lib/session";

const DUMMY_HASH = "$2a$12$g8hZ0Xn6yqXG0M7C2sVQOu0Zf6r7VxJH8nJmO2h2cQvY5r7yqzM2K";

// Shared with changePasswordAction below so signup and a later password
// change can never drift apart on what counts as "strong enough".
const passwordRule = z.string().min(8, "Use at least 8 characters");

const credentials = z.object({
  email: z.string().email(),
  password: passwordRule,
});

const signup = credentials.extend({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscores only"),
  displayName: z.string().min(2).max(32),
});

export type FormState = { error?: string } | undefined;

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Check your email and password." };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  // Always run a compare so response time does not reveal whether the account exists.
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "That email and password don't match." };
  if (user.status !== "ACTIVE") return { error: "This account is not available." };

  await createSession(user.id);
  redirect(safeReturnTo(formData.get("returnTo")) ?? (user.onboardedAt ? "/home" : "/onboarding"));
}

export async function register(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = signup.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    username: String(formData.get("username") ?? "").toLowerCase(),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: parsed.data.email.toLowerCase() }, { username: parsed.data.username }],
    },
  });
  if (existing) return { error: "That email or username is already taken." };

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      profile: { create: { languages: ["en"] } },
    },
  });

  await createSession(user.id);
  redirect("/onboarding");
}

const passwordChange = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordRule,
  confirmPassword: z.string().min(1, "Confirm your new password."),
});

export type ChangePasswordResult = { success: true } | { error: string };

/**
 * Changes the signed-in user's password from the settings page. The
 * current password is bcrypt-verified against the stored hash, not just
 * inferred from having a valid session — a hijacked-but-still-logged-in
 * session shouldn't be enough on its own to lock the real owner out. The
 * new password goes through the same strength rule signup uses
 * (passwordRule, above) and is rejected outright if it bcrypt-matches the
 * password already on file.
 *
 * On success every OTHER session for this user is revoked — same "cut off
 * a stolen session" reasoning as suspendReportedUserAction in
 * moderation.ts, just self-triggered here instead of moderator-triggered.
 * The session that made this change is deliberately kept, so changing
 * your password doesn't also log you out of the tab you did it from.
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ChangePasswordResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };
  if (!user.passwordHash) {
    return { error: "This account signs in with Google and doesn't have a password to change." };
  }

  const parsed = passwordChange.safeParse({ currentPassword, newPassword, confirmPassword });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { error: "New password and confirmation don't match." };
  }

  const currentValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentValid) return { error: "That's not your current password." };

  const unchanged = await bcrypt.compare(parsed.data.newPassword, user.passwordHash);
  if (unchanged) return { error: "Your new password must be different from your current one." };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const sessionId = await getCurrentSessionId();

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // Keeps this request's own session — everything else tied to the
    // account is signed out immediately, the same way a suspension takes
    // effect on its next request rather than needing separate teardown.
    prisma.session.deleteMany({
      where: { userId: user.id, ...(sessionId ? { id: { not: sessionId } } : {}) },
    }),
  ]);

  return { success: true };
}
