/**
 * AttachmentMessagePayload.key stores the object's storage key (e.g.
 * "attachments/<conversationId>/<senderId>/<uuid>.jpg"), not a fetchable
 * URL — same reasoning as avatarSrc/clipVideoSrc: the bucket is private,
 * so there's no R2 URL that works directly in an <img>/<video> src. This
 * builds the app-route path that actually serves it (see
 * src/app/api/attachments/[...key]/route.ts) — the only route that turns
 * this kind of key back into real bytes, and the only one that checks the
 * requester is actually a participant of the conversation embedded in the
 * key before it does.
 */
export function attachmentSrc(key: string): string {
  return `/api/attachments/${key.split("/").map(encodeURIComponent).join("/")}`;
}
