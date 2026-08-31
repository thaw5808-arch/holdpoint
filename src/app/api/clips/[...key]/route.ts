import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

// Headers worth forwarding straight through from R2's response — whatever
// it decided about ranges, caching and identity is what the browser should
// see too.
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
 * Fronts the private R2 bucket for clip video, the same way the avatars
 * route fronts it for images — except a <video> element seeks by issuing
 * Range requests against whatever URL sits in its `src`, and a plain 302
 * redirect to a signed URL can't be trusted to carry that off (some
 * players don't retry the redirected request with the same Range header,
 * and every seek would otherwise cost a fresh signed URL negotiation).
 * So this fetches the signed URL itself, forwards the browser's Range
 * header along to R2, and pipes R2's response — 200 or 206, whichever it
 * chose — straight back with the same status and range headers intact.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const objectKey = key.join("/");

  // Scoped to the clips/ prefix this route is named for — not a general
  // purpose proxy for whatever else ends up in the same bucket.
  if (!objectKey.startsWith("clips/")) {
    return new NextResponse("Not found", { status: 404 });
  }

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
  // R2 always advertises range support; make sure that survives even if
  // this particular response (a non-range initial request) didn't repeat it.
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
