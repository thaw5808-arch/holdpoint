import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./prisma";

const COOKIE = "hp_session";
const MAX_AGE_DAYS = 30;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

function sign(sessionId: string) {
  return createHmac("sha256", secret()).update(sessionId).digest("base64url");
}

function verify(raw: string): string | null {
  const [id, mac] = raw.split(".");
  if (!id || !mac) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(mac);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? id : null;
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + MAX_AGE_DAYS * 864e5);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, `${session.id}.${sign(session.id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const id = raw ? verify(raw) : null;
  if (id) await prisma.session.deleteMany({ where: { id } });
  jar.delete(COOKIE);
}

// Cached (per-request, via React's cache()) so getCurrentUser and
// getCurrentSessionId share the same lookup instead of each hitting the
// Session table separately when both are used on the same request.
const getVerifiedSession = cache(async () => {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const id = verify(raw);
  if (!id) return null;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { include: { profile: true, preference: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await getVerifiedSession();
  return session?.user ?? null;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** The signed-in session's own id — the thing ClipView dedups a view
 * against, since "once per session" means once per this row, not once
 * per user forever. Only meaningful alongside a valid getCurrentUser(). */
export const getCurrentSessionId = cache(async () => {
  const session = await getVerifiedSession();
  return session?.id ?? null;
});

/** Only ever redirect to an in-app relative path. */
export function safeReturnTo(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
