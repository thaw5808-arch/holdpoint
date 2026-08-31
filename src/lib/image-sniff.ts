/**
 * Identifies an image's real format from its magic bytes. Never trust a
 * browser-supplied MIME type or a file extension for this — both are just
 * labels the client chose and can say anything regardless of what the
 * bytes actually are.
 */
export type SniffedImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const EXT_FOR_TYPE: Record<SniffedImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensionFor(type: SniffedImageType): string {
  return EXT_FOR_TYPE[type];
}

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "image/gif"; // GIF89a
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return "image/gif"; // GIF87a
  // WebP: "RIFF" .... "WEBP" — the middle 4 bytes are a file-size field, not signature.
  if (matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }
  return null;
}
