"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BadgeCheck, Bell, Heart, MoreHorizontal, Scissors, Share2, Star } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { followLabel } from "@/components/follow-button";
import { LiveChat, type ChatLine } from "@/components/live-chat";
import { StreamPlayer } from "@/components/stream-player";
import { Pill } from "@/components/ui";
import { toggleFollowAction } from "@/lib/actions/follow";
import { compactNumber, uptime } from "@/lib/format";

export interface PollView {
  id: string;
  kind: string;
  question: string;
  options: { id: string; label: string; votes: number; points: number }[];
}

export function WatchView({
  viewerId,
  stream,
  chat,
  poll,
  followed,
  followsViewer,
  subscribed,
}: {
  viewerId: string | null;
  stream: {
    id: string;
    userId: string;
    slug: string;
    title: string;
    displayName: string;
    username: string;
    avatarUrl?: string | null;
    verified: boolean;
    game: string | null;
    gameSlug: string | null;
    tags: string[];
    viewers: number;
    followers: number;
    startedAt: string | null;
    isLive: boolean;
    slowMode: number;
    followersOnly: boolean;
    subsOnly: boolean;
    about: string;
  };
  chat: ChatLine[];
  poll: PollView | null;
  followed: boolean;
  /** Does this channel's owner already follow the viewer back? Only
   * changes the button's label ("Follow" vs "Follow back") — see
   * followLabel in follow-button.tsx. */
  followsViewer: boolean;
  subscribed: boolean;
}) {
  const [theater, setTheater] = useState(false);
  const [following, setFollowing] = useState(followed);
  const [voted, setVoted] = useState<string | null>(null);
  const [isTogglingFollow, startFollowTransition] = useTransition();

  const totalVotes = poll ? poll.options.reduce((sum, option) => sum + option.votes, 0) || 1 : 1;
  const isOwnChannel = viewerId === stream.userId;

  // Mirrors sendChatMessageAction's own gating so the input isn't shown as
  // open only to bounce every send with a server error — the action
  // re-checks all of this itself regardless of what's computed here.
  const chatDisabledReason = !viewerId
    ? "Log in to chat."
    : stream.subsOnly && !subscribed
      ? "Subscribers-only chat. Subscribe to the channel to join in."
      : stream.followersOnly && !following
        ? "Followers-only chat. Follow the channel to join in."
        : "";
  const canPost = chatDisabledReason === "";

  const handleFollowToggle = () => {
    const optimistic = !following;
    setFollowing(optimistic);
    startFollowTransition(async () => {
      const result = await toggleFollowAction(stream.userId);
      if ("error" in result) {
        setFollowing(!optimistic); // roll back
      } else {
        setFollowing(result.following);
      }
    });
  };

  return (
    <div className={theater ? "" : "mx-auto max-w-[1500px] px-0 sm:px-4 sm:py-4"}>
      <div
        className={`grid min-h-0 ${
          theater ? "lg:h-[calc(100dvh-56px)] lg:grid-cols-[1fr_340px]" : "lg:grid-cols-[1fr_340px]"
        }`}
      >
        <div className="min-w-0">
          <StreamPlayer
            seed={stream.slug}
            game={stream.game}
            live={stream.isLive}
            theater={theater}
            onToggleTheater={() => setTheater((value) => !value)}
          />

          {!theater && (
            <div className="px-3 py-4 sm:px-0 sm:pt-4">
              <div className="flex flex-wrap items-start gap-3">
                <Link href={`/u/${stream.username}`}>
                  <Avatar
                    name={stream.displayName}
                    seed={stream.username}
                    size={52}
                    live={stream.isLive}
                    avatarUrl={stream.avatarUrl}
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/u/${stream.username}`} className="display text-base uppercase tracking-[0.04em] hover:text-signal">
                      {stream.displayName}
                    </Link>
                    {stream.verified && <BadgeCheck size={15} className="text-signal" />}
                    <span className="tabular text-[0.75rem] text-faint">
                      {compactNumber(stream.followers)} followers
                    </span>
                  </div>
                  <h1 className="mt-0.5 text-[0.95rem] text-text">{stream.title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {stream.game && (
                      <Link href={`/discover?game=${stream.gameSlug}`}>
                        <Pill tone="signal">{stream.game}</Pill>
                      </Link>
                    )}
                    {stream.tags.map((tag) => (
                      <Pill key={tag}>{tag}</Pill>
                    ))}
                    {stream.isLive && stream.startedAt && (
                      <span className="tabular text-[0.6875rem] text-faint">
                        Live {uptime(new Date(stream.startedAt))} · {compactNumber(stream.viewers)} watching
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isOwnChannel && (
                    <button
                      className={following ? "btn" : "btn btn-primary"}
                      onClick={handleFollowToggle}
                      aria-pressed={following}
                      disabled={isTogglingFollow}
                    >
                      <Heart size={14} fill={following ? "currentColor" : "none"} />
                      {followLabel(following, followsViewer)}
                    </button>
                  )}
                  <button className="btn">
                    <Star size={14} /> Subscribe
                  </button>
                  <button className="btn btn-ghost px-2" aria-label="Notify me">
                    <Bell size={16} />
                  </button>
                  <button className="btn btn-ghost px-2" aria-label="Clip that">
                    <Scissors size={16} />
                  </button>
                  <button className="btn btn-ghost px-2" aria-label="Share">
                    <Share2 size={16} />
                  </button>
                  <button className="btn btn-ghost px-2" aria-label="More">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>

              {poll && (
                <section className="mt-5 border border-line bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="eyebrow">{poll.kind === "PREDICTION" ? "Prediction" : "Poll"}</p>
                    <p className="tabular text-[0.6875rem] text-faint">
                      {compactNumber(totalVotes)} entries
                    </p>
                  </div>
                  <h2 className="display mb-3 text-sm uppercase tracking-[0.04em]">{poll.question}</h2>
                  <ul className="space-y-2">
                    {poll.options.map((option) => {
                      const share = Math.round((option.votes / totalVotes) * 100);
                      const chosen = voted === option.id;
                      return (
                        <li key={option.id}>
                          <button
                            onClick={() => setVoted(option.id)}
                            aria-pressed={chosen}
                            className="relative flex w-full items-center justify-between border border-line px-3 py-2 text-left hover:border-line-strong"
                          >
                            <span
                              aria-hidden
                              className={`absolute inset-y-0 left-0 ${chosen ? "bg-signal/22" : "bg-raised"}`}
                              style={{ width: `${share}%` }}
                            />
                            <span className="relative text-sm">{option.label}</span>
                            <span className="tabular relative text-[0.75rem] text-muted">
                              {share}% · {compactNumber(option.points)} pts
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2.5 text-[0.6875rem] text-faint">
                    Entries use channel points. Points buy rewards, never competitive advantage.
                  </p>
                </section>
              )}

              <section className="mt-5 border border-line bg-surface p-4">
                <p className="eyebrow mb-2">About the channel</p>
                <p className="max-w-2xl text-sm leading-relaxed text-muted">{stream.about}</p>
              </section>
            </div>
          )}
        </div>

        <div className="h-[60vh] min-h-0 lg:h-auto">
          <LiveChat
            streamId={stream.id}
            initial={chat}
            slowMode={stream.slowMode}
            canPost={canPost}
            disabledReason={chatDisabledReason}
          />
        </div>
      </div>
    </div>
  );
}
