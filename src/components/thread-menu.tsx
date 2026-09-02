"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, BellOff, Check, MoreVertical, Trash2, User, Users, X } from "lucide-react";
import type { ConversationTheme } from "@prisma/client";
import { Avatar } from "@/components/avatar";
import {
  deleteConversationAction,
  setConversationThemeAction,
  toggleMuteConversationAction,
} from "@/lib/actions/conversation";

export interface ThreadMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

/** Fixed swatch set pulled straight from the design system's own accent
 * colours (see globals.css's @theme block) — deliberately not a free
 * colour picker, and deliberately not `live`: that hue is reserved for the
 * LIVE indicator everywhere else in the app. */
const THEME_OPTIONS: { value: ConversationTheme; label: string; swatch: string }[] = [
  { value: "SIGNAL", label: "Signal", swatch: "bg-signal" },
  { value: "GOLD", label: "Gold", swatch: "bg-gold" },
  { value: "ICE", label: "Ice", swatch: "bg-ice" },
];

/**
 * The thread header's three-dot menu — view profile/members, mute, theme,
 * delete. A plain popover in the same shape as Topbar's own menus (glass
 * panel, outside-click + Escape to dismiss), with role="menu"/"menuitem"
 * and arrow-key roving focus layered on top since this one acts on the
 * conversation rather than just linking elsewhere.
 */
export function ThreadMenu({
  conversationId,
  isGroup,
  /** Every other participant — the profile link's target for a 1:1, the
   * roster shown in "View members" for a group. Never includes the viewer
   * themselves, same as page.tsx's own `others`. */
  members,
  initialMuted,
  initialTheme,
}: {
  conversationId: string;
  isGroup: boolean;
  members: ThreadMember[];
  initialMuted: boolean;
  initialTheme: ConversationTheme;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [muted, setMuted] = useState(initialMuted);
  const [theme, setTheme] = useState(initialTheme);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Arrow-key roving focus across every item in the panel (the theme
  // swatches included) plus Home/End to the ends. Click and Tab already
  // work for free — every item below is a real <button>/<a>.
  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(currentIndex + 1 + items.length) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  const solo = !isGroup ? members[0] : undefined;

  function toggleMute() {
    const next = !muted;
    setMuted(next); // optimistic, reverted below on failure
    setOpen(false);
    startTransition(async () => {
      const result = await toggleMuteConversationAction(conversationId);
      if ("error" in result) setMuted(!next);
    });
  }

  function pickTheme(value: ConversationTheme) {
    const previous = theme;
    setTheme(value);
    setOpen(false);
    startTransition(async () => {
      const result = await setConversationThemeAction(conversationId, value);
      if ("error" in result) setTheme(previous);
    });
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          className="btn btn-ghost px-1.5"
          aria-label="Conversation options"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <MoreVertical size={16} />
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Conversation options"
            onKeyDown={handleMenuKeyDown}
            className="glass-strong absolute right-0 top-10 z-50 w-60 p-1"
          >
            {solo ? (
              <Link
                href={`/u/${solo.username}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-surface"
              >
                <User size={15} className="text-faint" />
                View profile
              </Link>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowMembers(true);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface"
              >
                <Users size={15} className="text-faint" />
                View members
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={toggleMute}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface"
            >
              {muted ? <BellOff size={15} className="text-faint" /> : <Bell size={15} className="text-faint" />}
              {muted ? "Unmute notifications" : "Mute notifications"}
            </button>

            <div className="border-t border-line/60 px-3 py-2.5">
              <p className="eyebrow mb-2">Theme</p>
              <div role="group" aria-label="Bubble colour" className="flex gap-2.5">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === option.value}
                    aria-label={option.label}
                    onClick={() => pickTheme(option.value)}
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${option.swatch} ${
                      theme === option.value ? "ring-2 ring-text ring-offset-2 ring-offset-canvas" : ""
                    }`}
                  >
                    {theme === option.value && <Check size={12} className="text-ink" />}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setShowDelete(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 border-t border-line/60 px-3 py-2.5 text-left text-sm text-live hover:bg-surface"
            >
              <Trash2 size={15} />
              Delete chat
            </button>
          </div>
        )}
      </div>

      {showMembers && <MembersDialog members={members} onClose={() => setShowMembers(false)} />}
      {showDelete && (
        <DeleteChatDialog
          conversationId={conversationId}
          onClose={() => setShowDelete(false)}
          onDeleted={() => router.push("/messages")}
        />
      )}
    </>
  );
}

function MembersDialog({ members, onClose }: { members: ThreadMember[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Conversation members"
        onClick={(event) => event.stopPropagation()}
        className="glass-strong w-full max-w-sm p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Members</p>
          <button type="button" className="btn btn-ghost px-1.5" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <ul className="space-y-1">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={`/u/${member.username}`}
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-raised"
              >
                <Avatar name={member.displayName} seed={member.username} size={30} avatarUrl={member.avatarUrl} />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{member.displayName}</span>
                  <span className="block truncate text-[0.6875rem] text-faint">@{member.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DeleteChatDialog({
  conversationId,
  onClose,
  onDeleted,
}: {
  conversationId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !isPending && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isPending]);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteConversationAction(conversationId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onDeleted();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-sm"
      onClick={() => !isPending && onClose()}
    >
      <div
        role="dialog"
        aria-label="Delete chat"
        onClick={(event) => event.stopPropagation()}
        className="glass-strong w-full max-w-sm p-4"
      >
        <p className="eyebrow mb-2">Delete chat</p>
        {/* This is a hide, not a real delete — see ConversationMember.hiddenAt
            in schema.prisma for the full reasoning. Said plainly here so
            nobody expects it to erase anything for the other participant. */}
        <p className="mb-4 text-sm text-muted">
          This removes the conversation from your inbox — it can&rsquo;t be undone from here. The other
          participant keeps their copy and everything you&rsquo;ve sent; if they message you again, it comes
          back to your inbox.
        </p>
        {error && (
          <p role="alert" className="mb-3 text-[0.75rem] text-live">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
