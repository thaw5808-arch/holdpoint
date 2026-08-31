"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Mic, Plus, Pencil, Trash2, X } from "lucide-react";
import {
  createCommunityChannelAction,
  deleteCommunityChannelAction,
  renameCommunityChannelAction,
  reorderCommunityChannelsAction,
} from "@/lib/actions/community";
import { Avatar } from "@/components/avatar";
import { CHANNEL_KIND_ICON } from "@/lib/channel-kind-icon";
import { CHANNEL_KINDS, CHANNEL_KIND_LABELS, type ChannelKindValue } from "@/lib/channel-kinds";

export interface CommunityChannelNavItem {
  id: string;
  name: string;
  kind: ChannelKindValue;
}

export interface LegacyVoiceRoomItem {
  id: string;
  name: string;
  capacity: number;
  participants: {
    id: string;
    speaking: boolean;
    username: string;
    displayName: string;
    avatarUrl?: string;
  }[];
}

/**
 * The sidebar's Channels + Voice sections. `channels` is every kind mixed
 * together (as CommunityChannel query returns them) — this component is
 * what actually splits VOICE-kind channels out into the Voice section
 * rather than listing them with the text-like ones, and is the single
 * place that split needs to happen (there was previously nowhere doing
 * this at all; every channel just rendered under "Channels").
 *
 * `legacyVoiceRooms` is the older, separate VoiceRoom/VoiceParticipant
 * concept (seed data — "Queue up", "Scrim room") — unrelated to
 * CommunityChannel and passed straight through under the same Voice
 * heading, unchanged from how [slug]/page.tsx used to render it inline.
 *
 * The "+" create control and all rename/delete/reorder controls only
 * render at all for `isModerator`, but that's a display nicety, not the
 * boundary: every action re-checks the caller's role from the DB on its
 * own (requireCommunityModerator in actions/community.ts).
 */
export function CommunityChannelNav({
  communityId,
  channels,
  activeChannelId,
  communitySlug,
  isModerator,
  legacyVoiceRooms,
}: {
  communityId: string;
  channels: CommunityChannelNavItem[];
  activeChannelId: string | undefined;
  communitySlug: string;
  isModerator: boolean;
  legacyVoiceRooms: LegacyVoiceRoomItem[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<ChannelKindValue>("TEXT");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreateError(null);
    startTransition(async () => {
      const result = await createCommunityChannelAction(communityId, newName.trim(), newKind);
      if ("error" in result) {
        setCreateError(result.error);
        return;
      }
      setNewName("");
      setNewKind("TEXT");
      setCreateOpen(false);
    });
  };

  const textChannels = channels.filter((entry) => entry.kind !== "VOICE");
  const voiceChannels = channels.filter((entry) => entry.kind === "VOICE");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow">Channels</p>
        {isModerator && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setCreateError(null);
              setCreateOpen((open) => !open);
            }}
            aria-label={createOpen ? "Cancel add channel" : "Add channel"}
            aria-pressed={createOpen}
          >
            {createOpen ? <X size={13} /> : <Plus size={13} />}
          </button>
        )}
      </div>

      {isModerator && createOpen && (
        <form onSubmit={handleCreate} className="mb-2 space-y-1.5 border border-line bg-surface p-2">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Channel name"
            maxLength={30}
            required
            autoFocus
            className="input py-1 text-[0.8125rem]"
            aria-label="New channel name"
          />
          <select
            value={newKind}
            onChange={(event) => setNewKind(event.target.value as ChannelKindValue)}
            className="input py-1 text-[0.8125rem]"
            aria-label="New channel kind"
          >
            {CHANNEL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CHANNEL_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
          {createError && (
            <p role="alert" className="text-[0.6875rem] text-live">
              {createError}
            </p>
          )}
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary px-2 py-1 text-[0.6875rem]" disabled={isPending}>
              {isPending ? "Adding…" : "Add channel"}
            </button>
          </div>
        </form>
      )}

      <ChannelGroup
        communityId={communityId}
        communitySlug={communitySlug}
        channels={textChannels}
        activeChannelId={activeChannelId}
        isModerator={isModerator}
      />

      <p className="eyebrow mb-2 mt-5">Voice</p>
      <ChannelGroup
        communityId={communityId}
        communitySlug={communitySlug}
        channels={voiceChannels}
        activeChannelId={activeChannelId}
        isModerator={isModerator}
      />

      {legacyVoiceRooms.length > 0 && (
        <ul className="mt-2 space-y-2">
          {legacyVoiceRooms.map((room) => (
            <li key={room.id} className="border border-line bg-surface p-2">
              <p className="flex items-center gap-1.5 text-[0.8125rem]">
                <Mic size={12} className="text-signal" />
                {room.name}
              </p>
              <ul className="mt-1.5 space-y-1">
                {room.participants.map((participant) => (
                  <li key={participant.id}>
                    <Link
                      href={`/u/${participant.username}`}
                      className="flex items-center gap-1.5 hover:text-signal"
                    >
                      <Avatar name={participant.displayName} seed={participant.username} size={18} avatarUrl={participant.avatarUrl} />
                      <span className={`truncate text-[0.6875rem] ${participant.speaking ? "text-signal" : "text-faint"}`}>
                        {participant.displayName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="tabular mt-1.5 text-[0.625rem] text-faint">
                {room.participants.length}/{room.capacity}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One drag-reorderable, rename/delete-capable list of channel rows.
 * Rendered twice by CommunityChannelNav above — once for text-like
 * channels, once for VOICE-kind ones — each instance completely
 * independent: its own local drag/rename/delete state, and dragging only
 * ever reorders within the group it started in (CommunityChannel.position
 * is a single shared number space, but each group only ever reorders the
 * ids it was given, so a tie with the other group's positions can't
 * affect this group's own relative order — see the comment on
 * reorderCommunityChannelsAction in actions/community.ts).
 *
 * At rest a row is just its icon and name, Discord-style — rename/delete
 * only show up on hover or keyboard focus (`group-hover`/
 * `group-focus-within` below use opacity, not display:none, so Tab still
 * reaches them). Reordering is native HTML5 drag-and-drop: mouse-only, no
 * keyboard or touch equivalent — see the module comment in this file's
 * git history / the conversation that added it for that trade-off.
 */
function ChannelGroup({
  communityId,
  communitySlug,
  channels,
  activeChannelId,
  isModerator,
}: {
  communityId: string;
  communitySlug: string;
  channels: CommunityChannelNavItem[];
  activeChannelId: string | undefined;
  isModerator: boolean;
}) {
  const [items, setItems] = useState(channels);
  useEffect(() => setItems(channels), [channels]);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dropped = useRef(false);

  const startRename = (channel: CommunityChannelNavItem) => {
    setError(null);
    setConfirmDeleteId(null);
    setRenamingId(channel.id);
    setRenameValue(channel.name);
  };

  const handleRename = (channelId: string) => {
    if (!renameValue.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await renameCommunityChannelAction(channelId, renameValue.trim());
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRenamingId(null);
    });
  };

  const handleDelete = (channelId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteCommunityChannelAction(channelId);
      if ("error" in result) setError(result.error);
      setConfirmDeleteId(null);
    });
  };

  const handleDragStart = (event: React.DragEvent, channelId: string) => {
    dropped.current = false;
    setDraggingId(channelId);
    event.dataTransfer.setData("text/plain", channelId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (event: React.DragEvent, overId: string) => {
    event.preventDefault();
    if (!draggingId || overId === draggingId) return;
    setItems((current) => {
      const from = current.findIndex((entry) => entry.id === draggingId);
      const to = current.findIndex((entry) => entry.id === overId);
      if (from === -1 || to === -1 || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dropped.current = true;
    if (!draggingId) return;
    const orderedIds = items.map((entry) => entry.id);
    setError(null);
    startTransition(async () => {
      const result = await reorderCommunityChannelsAction(communityId, orderedIds);
      if ("error" in result) {
        setError(result.error);
        setItems(channels);
      }
    });
  };

  const handleDragEnd = () => {
    if (!dropped.current) setItems(channels);
    dropped.current = false;
    setDraggingId(null);
  };

  return (
    <>
      <ul className="space-y-0.5">
        {items.map((entry) => {
          const Icon = CHANNEL_KIND_ICON[entry.kind];
          const current = entry.id === activeChannelId;

          if (isModerator && renamingId === entry.id) {
            return (
              <li key={entry.id} className="flex items-center gap-1 px-1 py-0.5">
                <Icon size={13} className="shrink-0 text-faint" />
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  maxLength={30}
                  autoFocus
                  className="input min-w-0 flex-1 py-0.5 text-[0.8125rem]"
                  aria-label={`Rename ${entry.name}`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRename(entry.id);
                    }
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleRename(entry.id)}
                  disabled={isPending}
                  aria-label="Save name"
                >
                  <Check size={12} />
                </button>
                <button type="button" className="icon-btn" onClick={() => setRenamingId(null)} aria-label="Cancel rename">
                  <X size={12} />
                </button>
              </li>
            );
          }

          return (
            <li
              key={entry.id}
              className={`group flex items-center gap-0.5 ${draggingId === entry.id ? "opacity-40" : ""}`}
              onDragOver={isModerator ? (event) => handleDragOver(event, entry.id) : undefined}
              onDrop={isModerator ? handleDrop : undefined}
            >
              <Link
                href={`/communities/${communitySlug}?channel=${entry.name}`}
                draggable={isModerator}
                onDragStart={isModerator ? (event) => handleDragStart(event, entry.id) : undefined}
                onDragEnd={isModerator ? handleDragEnd : undefined}
                className={`flex min-w-0 flex-1 select-none items-center gap-2 px-2 py-1.5 text-[0.8125rem] ${
                  current ? "bg-surface text-text" : "text-muted hover:bg-surface"
                } ${isModerator ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <Icon size={13} className={`shrink-0 ${current ? "text-signal" : ""}`} />
                <span className="truncate">{entry.name}</span>
              </Link>

              {isModerator && confirmDeleteId === entry.id && (
                <span className="flex shrink-0 items-center gap-0.5">
                  <span className="eyebrow text-faint">Delete?</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    onClick={() => handleDelete(entry.id)}
                    disabled={isPending}
                    aria-label={`Confirm delete ${entry.name}`}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setConfirmDeleteId(null)}
                    aria-label="Cancel delete"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {isModerator && confirmDeleteId !== entry.id && (
                <span
                  className="flex shrink-0 items-center gap-0.5 opacity-0 pointer-events-none
                    group-hover:opacity-100 group-hover:pointer-events-auto
                    group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                >
                  <button type="button" className="icon-btn" onClick={() => startRename(entry)} aria-label={`Rename ${entry.name}`}>
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    onClick={() => {
                      setError(null);
                      setConfirmDeleteId(entry.id);
                    }}
                    aria-label={`Delete ${entry.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-1.5 text-[0.6875rem] text-live">
          {error}
        </p>
      )}
    </>
  );
}
