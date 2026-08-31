/**
 * Profile.avatarUrl stores the object's storage key (e.g.
 * "avatars/<userId>/<uuid>.png"), not a fetchable URL — the bucket is
 * private, so there's no R2 URL that would work directly in an <img src>.
 * This builds the app-route path that actually serves it (see
 * src/app/api/avatars/[...key]/route.ts), which is the only thing that
 * ever turns a key back into a signed R2 URL.
 */
export function avatarSrc(avatarKey: string | null | undefined): string | undefined {
  if (!avatarKey) return undefined;
  return `/api/avatars/${avatarKey.split("/").map(encodeURIComponent).join("/")}`;
}
