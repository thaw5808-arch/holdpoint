import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

/**
 * Fronts the private R2 bucket. Nothing outside this route ever gets a
 * usable R2 URL — an <img src> points here, this asks storage.getUrl()
 * for a short-lived signed URL, and redirects the browser to it. A 302
 * (not 301) matters: it expires with the signed URL, so nothing caches a
 * link that stops working a few minutes later.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const objectKey = key.join("/");

  // Scoped to the avatars/ prefix this route is named for — not a general
  // purpose proxy for whatever else ends up in the same bucket later.
  if (!objectKey.startsWith("avatars/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const url = await storage.getUrl(objectKey);
    return NextResponse.redirect(url, 302);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
