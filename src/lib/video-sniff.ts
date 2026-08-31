/**
 * Identifies a video's real container format from its magic bytes. Same
 * reasoning as image-sniff.ts: a browser-supplied MIME type or file
 * extension is just a label the client chose, and a renamed script with a
 * video/mp4 content-type would sail through either check untouched. Only
 * the actual bytes decide what this is.
 */
export type SniffedVideoType = "video/mp4" | "video/quicktime" | "video/webm" | "video/x-msvideo";

/**
 * Upload size cap. Shared by the client (a fast pre-check before it starts
 * a possibly slow upload) and the server (baked into the presigned PUT
 * URL's signature via Content-Length — see requestClipUploadAction — which
 * is the copy that actually matters, since the client-side check is only
 * ever a courtesy).
 */
export const MAX_CLIP_BYTES = 600 * 1024 * 1024; // 600MB — generous even for a 2-minute clip (see MAX_CLIP_DURATION_SEC) at a high-bitrate/high-res source before any re-encode.

/**
 * Upload duration cap, in seconds. Same shared-by-client-and-server split
 * as MAX_CLIP_BYTES above: checked client-side against the file's own
 * <video> metadata before an upload ever starts (a fast-fail UX only), and
 * re-checked server-side in finalizeClipUploadAction — which probes the
 * real uploaded object's duration (see probeVideoDurationSec in
 * video-probe.ts) rather than trusting whatever the client reports, since
 * a client calling that action directly could just lie about it.
 *
 * This is a clips feed, not a VOD host — 120s (2 minutes) is generous
 * headroom over the 15–60s a clip is typically expected to run, while
 * still keeping "clip" meaningfully short. Independent of MAX_CLIP_BYTES
 * above: that cap is sized for source file weight (resolution/bitrate),
 * this one for how long the moment itself runs — raising one isn't a
 * reason to raise the other.
 */
export const MAX_CLIP_DURATION_SEC = 120;

const EXT_FOR_TYPE: Record<SniffedVideoType, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-msvideo": "avi",
};

export function extensionFor(type: SniffedVideoType): string {
  return EXT_FOR_TYPE[type];
}

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

export function sniffVideoType(bytes: Uint8Array): SniffedVideoType | null {
  // ISO base media file format (MP4, MOV, M4V, …): a 4-byte box size
  // followed by a 4-byte box type. A well-formed file's first box is
  // "ftyp" at offset 4, with the major brand a few bytes further in
  // telling QuickTime's own flavor apart from everything else that
  // shares the same container shape.
  if (matches(bytes, 4, ascii("ftyp"))) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  // WebM (and Matroska, which shares the same EBML header) — what
  // MediaRecorder produces in every browser that isn't Safari.
  if (matches(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  // AVI: "RIFF" .... "AVI " — the middle 4 bytes are a file-size field,
  // not signature, same shape as the WebP check in image-sniff.ts.
  if (matches(bytes, 0, ascii("RIFF")) && matches(bytes, 8, ascii("AVI "))) return "video/x-msvideo";
  return null;
}
