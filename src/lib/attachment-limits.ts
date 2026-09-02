/**
 * Size/duration caps for a DM attachment — an inline image or short video
 * dropped into a chat, not the primary content-hosting feature (see
 * MAX_CLIP_BYTES/MAX_CLIP_DURATION_SEC in video-sniff.ts for that one).
 * Kept far below the clip caps on purpose: a chat attachment is a quick
 * screenshot or a few seconds of footage, not something meant to be
 * watched as content in its own right. Shared by the client (a fast
 * pre-check before starting a possibly-slow upload) and the server (the
 * copy that actually matters — see requestAttachmentUploadAction and
 * sendAttachmentMessageAction in actions/message.ts).
 */
export const MAX_ATTACHMENT_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — comfortable for a screenshot or phone photo.
export const MAX_ATTACHMENT_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_ATTACHMENT_VIDEO_DURATION_SEC = 60; // 1 minute — a quick clip, not a VOD.
