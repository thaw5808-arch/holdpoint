// Shared between src/lib/actions/clip.ts (which writes this payload onto a
// CLIP-kind Message) and any UI that renders one — currently just
// /messages' last-message preview. Kept out of actions/clip.ts because
// that file is "use server": every export from it must be an async
// function, and parseClipPayload is a plain sync parser, not an action.

export type ClipMessagePayload = {
  clipId: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
};

/** Narrows a Message.payload (Json, so structurally anything) down to the
 * clip-message shape. Returns null for anything that doesn't actually look
 * like one, rather than trusting the message's `kind` tag alone. */
export function parseClipPayload(payload: unknown): ClipMessagePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<ClipMessagePayload>;
  if (typeof candidate.clipId !== "string" || typeof candidate.title !== "string") return null;
  return {
    clipId: candidate.clipId,
    slug: typeof candidate.slug === "string" ? candidate.slug : "",
    title: candidate.title,
    thumbnailUrl: typeof candidate.thumbnailUrl === "string" ? candidate.thumbnailUrl : null,
  };
}
