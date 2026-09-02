import { storage } from "@/lib/storage";

/**
 * Reads back the first `byteCount` bytes of an object that's supposedly
 * already in the bucket, via a signed GET + Range request — the same
 * "sign a URL, fetch it, forward what R2 says" shape the clip/attachment
 * serving routes use, just done server-side instead of forwarded to a
 * browser. Returns null if the object doesn't exist or the request
 * otherwise fails, which callers treat as "the upload never landed."
 *
 * Also reports the object's real total size, off the `Content-Range`
 * header a satisfied Range request comes back with (`bytes 0-63/<total>`)
 * — used to re-check a size cap against what the object actually ended up
 * as, not what the client claimed when it asked for the upload URL. Null
 * if that header is missing for some reason (an unexpected 200 instead of
 * 206, say) — callers skip that particular re-check rather than fail an
 * upload over a header they can't read.
 *
 * Shared by prepareClipUpload (actions/clip.ts) and
 * sendAttachmentMessageAction (actions/message.ts) — the same "trust the
 * bytes, not the request" verification step, applied to two different
 * upload flows that both hand out a presigned PUT and only find out what
 * actually landed afterward.
 */
export async function readObjectPrefix(
  key: string,
  byteCount: number,
): Promise<{ bytes: Buffer; totalSize: number | null } | null> {
  const url = await storage.getUrl(key);
  const response = await fetch(url, { headers: { range: `bytes=0-${byteCount - 1}` } });
  if (!response.ok) return null;
  const contentRange = response.headers.get("content-range"); // "bytes 0-63/1234567"
  const totalSize = contentRange ? Number(contentRange.split("/")[1]) : NaN;
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    totalSize: Number.isFinite(totalSize) ? totalSize : null,
  };
}
