"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Film, Send } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { sendMessageAction } from "@/lib/actions/message";

export interface MessageClip {
  slug: string;
  title: string;
  posterUrl: string | null;
}

export interface MessageLine {
  id: string;
  senderId: string;
  senderDisplayName: string;
  senderUsername: string;
  senderAvatarUrl?: string | null;
  kind: "TEXT" | "CLIP" | "STREAM" | "TEAM_INVITE" | "TOURNAMENT_INVITE" | "PARTY_INVITE";
  body: string;
  /** Set only when kind === "CLIP" — parsed server-side from Message.payload
   * (see parseClipPayload in lib/clip-message.ts) and pre-resolved to a
   * fetchable poster URL, same as every other clip thumbnail in this app. */
  clip: MessageClip | null;
  createdAt: string;
}

const BODY_MAX = 2000;

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
}: {
  conversationId: string;
  viewerId: string;
  initial: MessageLine[];
}) {
  const [lines, setLines] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

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
                {line.clip ? (
                  <ClipMessageCard clip={line.clip} own={own} />
                ) : (
                  <p
                    className={`whitespace-pre-wrap break-words border px-3 py-2 text-[0.8125rem] leading-snug ${
                      own ? "border-signal/40 bg-signal/12 text-text" : "border-line bg-surface text-text"
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
        <div className="flex items-center gap-2">
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
        {error && (
          <p role="alert" className="mt-1.5 text-[0.6875rem] text-live">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ClipMessageCard({ clip, own }: { clip: MessageClip; own: boolean }) {
  return (
    <Link
      href={`/clips/${clip.slug}`}
      className={`flex items-center gap-2.5 border p-2 hover:border-line-strong ${
        own ? "border-signal/40 bg-signal/12" : "border-line bg-surface"
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
