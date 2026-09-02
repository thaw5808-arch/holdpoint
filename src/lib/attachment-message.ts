// Shared between src/lib/actions/message.ts (which writes this payload
// onto an IMAGE- or VIDEO-kind Message) and message-thread.tsx (which
// renders one) — the same "kind + JSON payload + a narrowing parser" shape
// clip-message.ts already established for MessageKind.CLIP, applied here
// to IMAGE/VIDEO instead. One payload shape covers both kinds: the only
// thing IMAGE and VIDEO ever need to render is where the file lives, and
// Message.kind is what tells the renderer which element to use for it —
// there's nothing image- or video-specific to carry here beyond that.

export type AttachmentMessagePayload = {
  key: string;
};

/** Narrows a Message.payload (Json, so structurally anything) down to the
 * attachment-message shape. Returns null for anything that doesn't
 * actually look like one, rather than trusting the message's `kind` tag
 * alone — same stance parseClipPayload takes. */
export function parseAttachmentPayload(payload: unknown): AttachmentMessagePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<AttachmentMessagePayload>;
  if (typeof candidate.key !== "string" || !candidate.key) return null;
  return { key: candidate.key };
}
