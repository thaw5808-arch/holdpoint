"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Film, Paperclip, Send, X } from "lucide-react";
import type { ConversationTheme, MessageKind } from "@prisma/client";
import { Avatar } from "@/components/avatar";
import { requestAttachmentUploadAction, sendAttachmentMessageAction, sendMessageAction } from "@/lib/actions/message";
import { MAX_ATTACHMENT_IMAGE_BYTES, MAX_ATTACHMENT_VIDEO_BYTES } from "@/lib/attachment-limits";
import { sniffImageType } from "@/lib/image-sniff";
import { putWithProgress } from "@/lib/upload-with-progress";
import { sniffVideoType } from "@/lib/video-sniff";

export interface MessageClip {
  slug: string;
  title: string;
  posterUrl: string | null;
}

export interface MessageAttachment {
  /** Fetchable app-route URL (attachmentSrc(key)) — never the raw storage
   * key, and never a direct R2 URL; see lib/attachment-url.ts. */
  src: string;
}

export interface MessageLine {
  id: string;
  senderId: string;
  senderDisplayName: string;
  senderUsername: string;
  senderAvatarUrl?: string | null;
  kind: MessageKind;
  body: string;
  /** Set only when kind === "CLIP" — parsed server-side from Message.payload
   * (see parseClipPayload in lib/clip-message.ts) and pre-resolved to a
   * fetchable poster URL, same as every other clip thumbnail in this app. */
  clip: MessageClip | null;
  /** Set only when kind is "IMAGE" or "VIDEO" — parsed server-side from
   * Message.payload (see parseAttachmentPayload in lib/attachment-message.ts)
   * and pre-resolved to a fetchable src, same treatment as `clip` above. */
  attachment: MessageAttachment | null;
  createdAt: string;
}

const BODY_MAX = 2000;

// Accepted for the composer's file picker — the actual "is this really an
// image/video" decision is a real magic-byte sniff (sniffImageType /
// sniffVideoType below), both client-side before an upload starts and,
// authoritatively, server-side in sendAttachmentMessageAction. This list
// is only ever a filter on what the OS file picker shows.
const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-msvideo";

/** Own-bubble border/fill per Conversation.themeColor — the literal class
 * strings need to appear in source for Tailwind to generate them, so this
 * stays a plain lookup rather than building the classes from the enum
 * value at runtime. Kept to the same three design-system accents ThreadMenu
 * offers (see its THEME_OPTIONS); "live" is deliberately never one of them. */
const OWN_BUBBLE_THEME: Record<ConversationTheme, string> = {
  SIGNAL: "border-signal/40 bg-signal/12",
  GOLD: "border-gold/45 bg-gold/12",
  ICE: "border-ice/45 bg-ice/12",
};

/**
 * The thread's scrollable message list plus its composer — everything
 * interactive on /messages/[id]. The header (back link, other
 * participant's name/avatar) is plain server-rendered JSX in page.tsx,
 * since none of it needs client state.
 *
 * No polling here, unlike LiveChat (live-chat.tsx): a stream's chat is one
 * shared room where strangers post while you watch, so polling is the only
 * way a new line ever shows up for someone just sitting on the page. A DM
 * thread's own sends already appear instantly (optimistic, same pattern as
 * LiveChat's send()) and there's no "everyone watching this exact thread
 * right now" case to keep in sync — the other person's reply shows up the
 * next time this page loads, the same as any other inbox.
 */
export function MessageThread({
  conversationId,
  viewerId,
  initial,
  theme = "SIGNAL",
}: {
  conversationId: string;
  viewerId: string;
  initial: MessageLine[];
  /** Conversation.themeColor — tints only the viewer's own sent bubbles,
   * same as everyone else in the thread sees it (it's shared, not a
   * per-viewer setting; see ThreadMenu's "Change theme"). */
  theme?: ConversationTheme;
}) {
  const [lines, setLines] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [attachError, setAttachError] = useState<string | null>(null);
  // null = no attachment upload in flight. Only one at a time — the
  // attach button is disabled while this is set (see the composer below).
  const [attachProgress, setAttachProgress] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  function send() {
    const body = draft.trim();
    if (!body || isPending) return;
    setError(null);
    setDraft("");

    // Optimistic local echo, reconciled with the real row once the action
    // returns — same shape as LiveChat's send() and ClipCommentsPanel's
    // add(). senderUsername/displayName on the placeholder are never
    // actually shown: `own` messages render without a name or avatar at
    // all (see the list below), so there's nothing for them to get wrong
    // in the instant before the server response swaps this line out.
    const localId = `local-${Date.now()}`;
    setLines((current) => [
      ...current,
      {
        id: localId,
        senderId: viewerId,
        senderDisplayName: "",
        senderUsername: "",
        kind: "TEXT",
        body,
        clip: null,
        attachment: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    startTransition(async () => {
      const result = await sendMessageAction(conversationId, body);
      if ("error" in result) {
        setError(result.error);
        setLines((current) => current.filter((line) => line.id !== localId));
        return;
      }
      setLines((current) => current.map((line) => (line.id === localId ? result.message : line)));
    });
  }

  // No local echo here, unlike send() above: there's nothing to optimistically
  // show until the file has actually reached R2 (the upload progress bar
  // below is the interim feedback instead), so this only ever appends the
  // real message once sendAttachmentMessageAction confirms it.
  async function sendAttachment(file: File | undefined) {
    if (!file || attachProgress !== null) return;
    setAttachError(null);

    if (file.size === 0) {
      setAttachError("That file is empty.");
      return;
    }

    // Client-side sniff is a fast-fail UX courtesy only — the server
    // re-sniffs the bytes it actually received regardless (see
    // sendAttachmentMessageAction), the same split every other upload
    // flow in this app uses.
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const imageType = sniffImageType(head);
    const videoType = imageType ? null : sniffVideoType(head);
    const kind: "IMAGE" | "VIDEO" | null = imageType ? "IMAGE" : videoType ? "VIDEO" : null;
    if (!kind) {
      setAttachError("Only images and short videos are supported.");
      return;
    }
    const contentType = imageType ?? videoType!;

    const maxBytes = kind === "IMAGE" ? MAX_ATTACHMENT_IMAGE_BYTES : MAX_ATTACHMENT_VIDEO_BYTES;
    if (file.size > maxBytes) {
      setAttachError(`Keep it under ${Math.floor(maxBytes / (1024 * 1024))}MB.`);
      return;
    }

    setAttachProgress(0);
    const requested = await requestAttachmentUploadAction({
      conversationId,
      kind,
      fileSize: file.size,
      contentType,
    });
    if ("error" in requested) {
      setAttachError(requested.error);
      setAttachProgress(null);
      return;
    }

    try {
      await putWithProgress(requested.uploadUrl, file, contentType, setAttachProgress);
    } catch (uploadError) {
      setAttachError(uploadError instanceof Error ? uploadError.message : "Upload failed. Try again.");
      setAttachProgress(null);
      return;
    }

    const result = await sendAttachmentMessageAction({ conversationId, key: requested.key, kind });
    setAttachProgress(null);
    if ("error" in result) {
      setAttachError(result.error);
      return;
    }
    setLines((current) => [...current, result.message]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-0">
        {lines.map((line) => {
          const own = line.senderId === viewerId;
          const pending = line.id.startsWith("local-");
          return (
            <li key={line.id} className={`flex items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
              {!own && (
                <Avatar
                  name={line.senderDisplayName}
                  seed={line.senderUsername}
                  size={26}
                  avatarUrl={line.senderAvatarUrl}
                />
              )}
              <div className={`flex max-w-[80%] flex-col sm:max-w-[65%] ${own ? "items-end" : "items-start"}`}>
                {line.attachment && line.kind === "IMAGE" ? (
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(line.attachment!.src)}
                    aria-label="Open image"
                    className={`block overflow-hidden border p-0.5 ${
                      own ? OWN_BUBBLE_THEME[theme] : "border-line bg-surface"
                    }`}
                  >
                    {/* Intrinsic size drives width/height here — no forced
                        crop or stretch, just capped so a huge photo doesn't
                        blow up the bubble. That's what keeps this at the
                        image's real aspect ratio without needing to know
                        its dimensions ahead of render. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={line.attachment.src} alt="Sent image" className="block max-h-72 w-auto max-w-full" />
                  </button>
                ) : line.attachment && line.kind === "VIDEO" ? (
                  <video
                    src={line.attachment.src}
                    controls
                    playsInline
                    className={`block max-h-72 w-auto max-w-full border p-0.5 ${
                      own ? OWN_BUBBLE_THEME[theme] : "border-line bg-surface"
                    }`}
                  />
                ) : line.clip ? (
                  <ClipMessageCard clip={line.clip} own={own} theme={theme} />
                ) : (
                  <p
                    className={`whitespace-pre-wrap break-words border px-3 py-2 text-[0.8125rem] leading-snug ${
                      own ? `${OWN_BUBBLE_THEME[theme]} text-text` : "border-line bg-surface text-text"
                    }`}
                  >
                    {line.body}
                  </p>
                )}
                <span className="tabular mt-1 text-[0.625rem] text-faint">
                  {pending
                    ? "Sending…"
                    : new Date(line.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            </li>
          );
        })}
        <div ref={bottom} />
      </ul>

      <div className="shrink-0 border-t border-line px-3 py-2.5 sm:px-0">
        {attachProgress !== null && (
          <div className="mb-2">
            <div className="h-1 w-full bg-line">
              <div className="h-full bg-signal transition-[width]" style={{ width: `${attachProgress}%` }} />
            </div>
            <p className="tabular mt-1 text-[0.6875rem] text-faint">Uploading… {attachProgress}%</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            onClick={() => attachInputRef.current?.click()}
            disabled={attachProgress !== null}
            aria-label="Attach an image or video"
            title="Attach an image or video"
          >
            <Paperclip size={15} />
          </button>
          <input
            ref={attachInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              void sendAttachment(event.target.files?.[0]);
              // Reset so picking the same file again (e.g. retrying after
              // an error) still fires onChange.
              event.target.value = "";
            }}
          />
          <input
            className="input"
            placeholder="Send a message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && send()}
            maxLength={BODY_MAX}
            aria-label="Send a message"
          />
          <button className="btn btn-primary px-2.5" onClick={send} aria-label="Send">
            <Send size={15} />
          </button>
        </div>
        {(error || attachError) && (
          <p role="alert" className="mt-1.5 text-[0.6875rem] text-live">
            {error ?? attachError}
          </p>
        )}
      </div>

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

function ClipMessageCard({ clip, own, theme }: { clip: MessageClip; own: boolean; theme: ConversationTheme }) {
  return (
    <Link
      href={`/clips/${clip.slug}`}
      className={`flex items-center gap-2.5 border p-2 hover:border-line-strong ${
        own ? OWN_BUBBLE_THEME[theme] : "border-line bg-surface"
      }`}
    >
      <div className="w-12 shrink-0">
        {clip.posterUrl ? (
          // Same reasoning as every other clip thumbnail in this app: served
          // through a redirecting app route in front of a private bucket.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.posterUrl} alt="" className="aspect-[9/16] w-full bg-ink object-cover" />
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center bg-ink">
            <Film size={14} className="text-faint" />
          </div>
        )}
      </div>
      <span className="min-w-0 text-[0.8125rem]">
        <span className="flex items-center gap-1 text-[0.625rem] text-signal">
          <Film size={11} /> Clip
        </span>
        <span className="block truncate">{clip.title}</span>
      </span>
    </Link>
  );
}

/**
 * What an inline image thumbnail opens into — full size, at its own
 * aspect ratio, over a dark overlay. Same shape as ClipViewerModal
 * (clip-viewer-modal.tsx): fixed inset-0 dark backdrop, a fixed
 * top-right close button, Escape or a click on the backdrop closes.
 * Unlike that one, there's nothing to fetch here — the thumbnail already
 * has the src, so this just renders it larger.
 */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed right-3 top-3 z-10 flex h-9 w-9 items-center justify-center text-white/70 hover:text-white"
      >
        <X size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
