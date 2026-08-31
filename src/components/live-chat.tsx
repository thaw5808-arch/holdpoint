"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Pin, Send, Settings2, Smile } from "lucide-react";
import { Pill } from "@/components/ui";
import { pollChatMessagesAction, sendChatMessageAction } from "@/lib/actions/chat";

export interface ChatLine {
  id: string;
  username: string;
  displayName: string;
  body: string;
  badges: ("SUB" | "MOD" | "VIP" | "RANK")[];
  rank?: string;
  pinned?: boolean;
  createdAt?: string;
}

const BADGE_LABEL: Record<string, string> = { SUB: "Sub", MOD: "Mod", VIP: "VIP" };

/**
 * Chat is windowed: only the last 120 lines stay mounted, which is what
 * keeps a fast channel from turning into thousands of live DOM nodes.
 */
const WINDOW = 120;

/** No sockets in this build — a plain interval poll stands in for one. */
const POLL_INTERVAL_MS = 3000;

export function LiveChat({
  streamId,
  initial,
  slowMode,
  canPost,
  disabledReason,
}: {
  streamId: string;
  initial: ChatLine[];
  slowMode: number;
  canPost: boolean;
  disabledReason: string;
}) {
  const [lines, setLines] = useState(initial);
  const [draft, setDraft] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  // The polling cursor: (createdAt, id) of the newest real row this tab
  // knows about. Seeded once from the initial server-rendered lines (an
  // empty channel falls back to the epoch, so a brand-new channel still
  // starts polling); it only ever advances off rows the server actually
  // returned — the send handler's optimistic line never moves it.
  const cursor = useRef(
    (() => {
      const last = [...initial].reverse().find((line) => line.createdAt);
      return last?.createdAt
        ? { createdAt: last.createdAt, id: last.id }
        : { createdAt: new Date(0).toISOString(), id: "" };
    })(),
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Poll for what arrived since the last line this tab actually knows
  // about. No sockets in this build, so this stands in for one.
  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      const at = cursor.current;
      const fresh = await pollChatMessagesAction(streamId, at.createdAt, at.id);
      if (cancelled || fresh.length === 0) return;
      setLines((current) => {
        const known = new Set(current.map((line) => line.id));
        const additions = fresh.filter((line) => !known.has(line.id));
        return additions.length === 0 ? current : [...current, ...additions].slice(-WINDOW);
      });
      const last = fresh[fresh.length - 1];
      if (last?.createdAt) cursor.current = { createdAt: last.createdAt, id: last.id };
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [streamId]);

  const pinned = lines.find((line) => line.pinned);

  function send() {
    const body = draft.trim();
    if (!body || cooldown > 0 || !canPost) return;
    setError(null);
    setDraft("");
    if (slowMode > 0) setCooldown(slowMode);

    const localId = `local-${Date.now()}`;
    setLines((current) =>
      [
        ...current,
        { id: localId, username: "you", displayName: "You", body, badges: [] as ChatLine["badges"] },
      ].slice(-WINDOW),
    );

    startTransition(async () => {
      const result = await sendChatMessageAction(streamId, body);
      if ("error" in result) {
        setError(result.error);
        setLines((current) => current.filter((line) => line.id !== localId));
        setCooldown(0);
        return;
      }
      // Reconcile the optimistic line with the real row — same id going
      // forward, so a later poll response for this exact message (it's
      // already past the cursor once this lands) is deduped as a repeat.
      setLines((current) => current.map((line) => (line.id === localId ? result.message : line)));
      if (result.message.createdAt) {
        cursor.current = { createdAt: result.message.createdAt, id: result.message.id };
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-line bg-ink">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
        <p className="eyebrow">Stream chat</p>
        <div className="flex items-center gap-1">
          {slowMode > 0 && <Pill tone="quiet">Slow {slowMode}s</Pill>}
          <button className="btn btn-ghost px-1.5" aria-label="Chat settings">
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      {pinned && (
        <div className="flex items-start gap-2 border-b border-line bg-surface px-3 py-2">
          <Pin size={13} className="mt-0.5 shrink-0 text-signal" />
          <p className="text-[0.8125rem] text-muted">
            <Link href={`/u/${pinned.username}`} className="text-text hover:text-signal">
              {pinned.displayName}
            </Link>{" "}
            {pinned.body}
          </p>
        </div>
      )}

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {lines.map((line) => {
          // The optimistic local echo hasn't been reconciled with a real
          // row yet — "you" isn't a resolvable username, so it's plain
          // text for the instant before the server response swaps it in.
          const pending = line.id.startsWith("local-");
          return (
            <li key={line.id} className="text-[0.8125rem] leading-snug">
              <span className="mr-1.5 inline-flex translate-y-0.5 items-center gap-1">
                {line.badges.map((badge) => (
                  <span
                    key={badge}
                    title={BADGE_LABEL[badge] ?? line.rank}
                    className={`inline-block h-3 w-3 chamfer-sm ${
                      badge === "MOD"
                        ? "bg-signal"
                        : badge === "SUB"
                          ? "bg-gold"
                          : badge === "VIP"
                            ? "bg-ice"
                            : "bg-line-strong"
                    }`}
                  />
                ))}
              </span>
              {pending ? (
                <span className="font-medium text-text">{line.displayName}</span>
              ) : (
                <Link href={`/u/${line.username}`} className="font-medium text-text hover:text-signal">
                  {line.displayName}
                </Link>
              )}
              <span className="text-faint">: </span>
              <span className="text-muted">{line.body}</span>
            </li>
          );
        })}
        <div ref={bottom} />
      </ul>

      <div className="shrink-0 border-t border-line p-2.5">
        {canPost ? (
          <>
            <div className="flex items-center gap-2">
              <input
                className="input"
                placeholder={cooldown > 0 ? `Slow mode · ${cooldown}s` : "Send a message"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && send()}
                disabled={cooldown > 0}
                maxLength={500}
                aria-label="Send a chat message"
              />
              <button className="btn btn-ghost px-2" aria-label="Emotes">
                <Smile size={16} />
              </button>
              <button className="btn btn-primary px-2.5" onClick={send} aria-label="Send">
                <Send size={15} />
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-1.5 text-[0.6875rem] text-live">
                {error}
              </p>
            )}
          </>
        ) : (
          <p className="text-[0.8125rem] text-muted">{disabledReason}</p>
        )}
      </div>
    </div>
  );
}
