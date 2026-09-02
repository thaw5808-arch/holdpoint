import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { storage } from "@/lib/storage";

// Headers worth forwarding straight through from R2's response — whatever
// it decided about ranges, caching and identity is what the browser should
// see too. Same list the clips route uses.
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "last-modified",
  "etag",
];

/**
 * Fronts the private R2 bucket for DM attachments — same Range-forwarding
 * shape as the clips route (src/app/api/clips/[...key]/route.ts; a
 * <video> needs real Range support to seek, and a plain redirect can't be
 * trusted to carry that off, see that route's own comment), but with a
 * per-request access check the clips/avatars routes don't need: those
 * front content that's public within the app (a profile avatar, a
 * published clip), while this fronts one private conversation's
 * attachment. A signed URL only ever gets generated for someone who is
 * actually a member of the conversation embedded in the key itself.
 *
 * Keys are shaped `attachments/<conversationId>/<senderId>/<file>` (see
 * requestAttachmentUploadAction in actions/message.ts) specifically so
 * this route can read the conversationId back out of the path and check
 * membership directly — no need to look up the Message/payload that
 * happens to reference this key.
 *
 * A failed check — not logged in, malformed key, or logged in but not a
 * participant — all return the same plain 404, the same
 * doesn't-confirm-existence stance the rest of this app takes for a gated
 * resource: nothing here tells someone probing a URL they found whether
 * it's "not allowed" or "doesn't exist".
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const [prefix, conversationId, ...rest] = key;
  const objectKey = key.join("/");

  if (prefix !== "attachments" || !conversationId || rest.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { id: true },
  });
  if (!membership) return new NextResponse("Not found", { status: 404 });

  let signedUrl: string;
  try {
    signedUrl = await storage.getUrl(objectKey);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const range = request.headers.get("range");
  const upstream = await fetch(signedUrl, range ? { headers: { range } } : undefined);

  if (!upstream.ok) {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
