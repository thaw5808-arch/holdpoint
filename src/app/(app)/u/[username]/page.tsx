import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { AvatarUpload } from "@/components/avatar-upload";
import { Emblem } from "@/components/emblem";
import { FollowButton } from "@/components/follow-button";
import { ProfileClips } from "@/components/profile-clips";
import { ProfileReportButton } from "@/components/profile-report-button";
import { EmptyState, Pill, RankChip, SectionHeader, StatTile } from "@/components/ui";
import { coverGradient } from "@/lib/art";
import { avatarSrc } from "@/lib/avatar-url";
import { clipPosterSrc } from "@/lib/clip-video-url";
import { compactNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { COSMETIC_UNLOCKS, levelProgress } from "@/lib/progression";
import { getCurrentUser } from "@/lib/session";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getCurrentUser();
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      profile: { include: { currentGame: true } },
      preference: true,
      ranks: { include: { game: true } },
      channel: { include: { game: true } },
      clips: { where: { published: true }, include: { game: true }, orderBy: { views: "desc" }, take: 6 },
      teams: { include: { team: { include: { games: { include: { game: true } } } } } },
      achievements: { include: { achievement: true }, orderBy: { unlockedAt: "desc" } },
      _count: { select: { followers: true, following: true } },
    },
  });
  if (!user) notFound();

  const isOwnProfile = viewer?.id === user.id;
  // Both directions of the relationship, not just the one this page's
  // button can toggle — "Follow back" only makes sense once you know
  // whether they already follow the viewer, which is the *other* Follow
  // row (followerId: user.id, followedId: viewer.id).
  const [isFollowing, followsViewer] =
    viewer && !isOwnProfile
      ? await Promise.all([
          prisma.follow
            .findUnique({ where: { followerId_followedId: { followerId: viewer.id, followedId: user.id } } })
            .then(Boolean),
          prisma.follow
            .findUnique({ where: { followerId_followedId: { followerId: user.id, followedId: viewer.id } } })
            .then(Boolean),
        ])
      : [false, false];
  const progress = levelProgress(user.profile?.xp ?? 0);
  const nextUnlock = COSMETIC_UNLOCKS.find((unlock) => unlock.level > progress.level);

  return (
    <div>
      <div className="h-32 sm:h-44" style={{ background: coverGradient(user.username) }} aria-hidden />
      <div className="mx-auto max-w-[1200px] px-3 sm:px-5">
        <header className="-mt-10 mb-6 flex flex-wrap items-end gap-4 border-b border-line pb-5">
          {isOwnProfile ? (
            <AvatarUpload
              name={user.displayName}
              seed={user.username}
              size={84}
              presence={user.presence}
              initialAvatarUrl={avatarSrc(user.profile?.avatarUrl)}
            />
          ) : (
            <Avatar
              name={user.displayName}
              seed={user.username}
              size={84}
              presence={user.presence}
              avatarUrl={avatarSrc(user.profile?.avatarUrl)}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="display text-xl uppercase tracking-[0.04em]">{user.displayName}</h1>
              {user.profile?.verified && <BadgeCheck size={16} className="text-signal" />}
            </div>
            <p className="tabular text-[0.8125rem] text-faint">
              @{user.username} · {user.profile?.region ?? "—"} ·{" "}
              {user.profile?.languages.join(", ") || "en"}
            </p>
            {user.profile?.bio && (
              <p className="mt-2 max-w-2xl text-sm text-muted">{user.profile.bio}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Pill tone="signal">Level {progress.level}</Pill>
              {user.presence === "IN_GAME" && user.profile?.currentGame && (
                <Pill tone="ice">In {user.profile.currentGame.shortName}</Pill>
              )}
              <span className="tabular text-[0.75rem] text-faint">
                {compactNumber(user._count.followers)} followers ·{" "}
                {compactNumber(user._count.following)} following
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {user.channel && (
              <Link href={`/watch/${user.channel.slug}`} className="btn">
                Channel
              </Link>
            )}
            {!isOwnProfile && (
              <FollowButton targetUserId={user.id} initialFollowing={isFollowing} followsYou={followsViewer} />
            )}
            {!isOwnProfile && <ProfileReportButton userId={user.id} />}
          </div>
        </header>

        <div className="mb-8 grid gap-3 sm:grid-cols-4">
          <div className="border border-line bg-surface p-3 sm:col-span-2">
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="eyebrow">Progression</p>
              <p className="tabular text-[0.6875rem] text-faint">
                {progress.into}/{progress.needed} XP
              </p>
            </div>
            <span className="block h-1.5 w-full bg-line">
              <span className="block h-full bg-signal" style={{ width: `${progress.percent}%` }} />
            </span>
            {nextUnlock && (
              <p className="mt-2 text-[0.75rem] text-muted">
                Level {nextUnlock.level} unlocks {nextUnlock.label.toLowerCase()} — cosmetic only.
              </p>
            )}
          </div>
          <StatTile label="Achievements" value={String(user.achievements.length)} tone="gold" />
          <StatTile label="Teams" value={String(user.teams.length)} />
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <section className="mb-8">
              <SectionHeader eyebrow="Games" title="Ranked profile" />
              {user.ranks.length === 0 ? (
                <p className="border border-dashed border-line p-5 text-sm text-muted">
                  No ranks added yet.
                </p>
              ) : (
                <div className="divide-y divide-line border border-line">
                  {user.ranks.map((rank) => (
                    <div key={rank.id} className="flex flex-wrap items-center gap-3 bg-surface px-3 py-3">
                      <span className="display min-w-40 flex-1 text-sm uppercase tracking-[0.04em]">
                        {rank.game.name}
                      </span>
                      <RankChip
                        tier={rank.tier}
                        tierIdx={rank.tierIdx}
                        tierCount={rank.game.rankTiers.length}
                        role={rank.role}
                      />
                      <span className="tabular text-[0.75rem] text-faint">{rank.hours}h played</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHeader eyebrow="Clips" title="Best moments" />
              {user.clips.length > 0 ? (
                <ProfileClips
                  isOwnProfile={isOwnProfile}
                  clips={user.clips.map((clip) => ({
                    id: clip.id,
                    slug: clip.slug,
                    title: clip.title,
                    displayName: user.displayName,
                    username: user.username,
                    game: clip.game?.shortName ?? null,
                    views: clip.views,
                    durationSec: clip.durationSec,
                    thumbnailUrl: clipPosterSrc(clip.thumbnailUrl),
                  }))}
                />
              ) : isOwnProfile ? (
                <EmptyState
                  title="No clips yet"
                  body="Upload a clip and it'll show up here."
                  action={{ href: "/clips/new", label: "Upload a clip" }}
                />
              ) : (
                <EmptyState title="No clips yet" body={`${user.displayName} hasn't published any clips yet.`} />
              )}
            </section>
          </div>

          <aside>
            <SectionHeader eyebrow="Teams" title="Rostered on" />
            <ul className="mb-8 space-y-2">
              {user.teams.map(({ team, role }) => (
                <li key={team.id}>
                  <Link href={`/teams/${team.slug}`} className="tick flex items-center gap-2.5 border border-line bg-surface p-2.5">
                    <Emblem seed={team.slug} tag={team.tag} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem]">{team.name}</span>
                      <span className="text-[0.6875rem] text-faint">{role.toLowerCase()}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {user.teams.length === 0 && <li className="text-sm text-muted">No teams yet.</li>}
            </ul>

            <SectionHeader eyebrow="Achievements" title="Unlocked" />
            <ul className="grid grid-cols-2 gap-2">
              {user.achievements.map(({ achievement, id }) => (
                <li key={id} className="chamfer border border-line bg-surface p-2.5">
                  <span
                    className="chamfer-sm mb-1.5 block h-7 w-7"
                    style={{
                      background:
                        achievement.tier === "GOLD" || achievement.tier === "PLATINUM"
                          ? "var(--color-gold)"
                          : "var(--color-line-strong)",
                    }}
                    aria-hidden
                  />
                  <p className="display text-[0.6875rem] uppercase tracking-[0.06em]">{achievement.name}</p>
                  <p className="mt-0.5 text-[0.6875rem] leading-snug text-faint">
                    {achievement.description}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
