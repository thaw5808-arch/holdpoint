/**
 * Both Clip.playbackUrl and Clip.thumbnailUrl store the object's storage
 * key (e.g. "clips/<userId>/<uuid>.mp4" or "clips/<userId>/<uuid>.jpg"),
 * not a fetchable URL — same reasoning as avatarSrc in avatar-url.ts: the
 * bucket is private, so there's no R2 URL that works directly in a
 * <video src> or <img src>. This builds the app-route path that actually
 * serves either one (see src/app/api/clips/[...key]/route.ts, which
 * fronts anything under the clips/ prefix, not just video), which is the
 * only thing that ever turns a key back into real bytes.
 */
function clipAssetSrc(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return `/api/clips/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export const clipVideoSrc = clipAssetSrc;
export const clipPosterSrc = clipAssetSrc;
