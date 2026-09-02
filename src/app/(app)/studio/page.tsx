import Link from "next/link";
import { redirect } from "next/navigation";
import { Copy } from "lucide-react";
import { Thumb } from "@/components/cards";
import { Spark } from "@/components/spark";
import { StreamDetailsForm } from "@/components/stream-details-form";
import { StudioLiveControls } from "@/components/studio-live-controls";
import { EmptyState, LiveTag, Pill, SectionHeader, StatTile } from "@/components/ui";
import { compactNumber, duration } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function StudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stream = await prisma.stream.findUnique({
    where: { userId: user.id },
    include: {
      game: true,
      sessions: { orderBy: { startedAt: "desc" }, take: 8 },
      clips: { orderBy: { views: "desc" }, take: 5 },
      vods: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!stream) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="You don't have a channel yet"
          body="Creating a channel gives you a stream key, a VOD archive and a dashboard. You can set it up before you ever go live."
          action={{ href: "/studio/create", label: "Create your channel" }}
        />
      </div>
    );
  }

  const [subs, followers, games] = await Promise.all([
    prisma.subscription.count({ where: { creatorId: user.id, cancelled: false } }),
    prisma.follow.count({ where: { followedId: user.id } }),
    prisma.game.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
  ]);

  const sessions = [...stream.sessions].reverse();
  const watchHours = Math.round(sessions.reduce((sum, s) => sum + s.minutesWatched, 0) / 60);
  const gained = sessions.reduce((sum, s) => sum + s.followersGained, 0);
  const avgViewers = sessions.length
    ? Math.round(sessions.reduce((sum, s) => sum + s.avgViewers, 0) / sessions.length)
    : 0;

  return (
    <div className="mx-auto max-w-[1300px] px-3 py-5 sm:px-5">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
        <div>
          <p className="eyebrow mb-1">Creator dashboard</p>
          <h1 className="display text-xl uppercase tracking-[0.05em]">Stream manager</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/studio/highlights" className="btn">
            Highlight studio
          </Link>
          <StudioLiveControls initialLive={stream.isLive} />
        </div>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <div className="relative">
            <Thumb seed={stream.slug} className="aspect-video w-full" label={stream.game?.shortName} />
            <div className="absolute left-3 top-3">
              {stream.isLive ? <LiveTag viewers={stream.viewerCount} /> : <Pill tone="quiet">Offline</Pill>}
            </div>
          </div>
          <div className="mt-3 space-y-3 border border-line bg-surface p-3">
            <StreamDetailsForm
              initialTitle={stream.title}
              initialGameSlug={stream.game?.slug ?? ""}
              initialTags={stream.tags.join(", ")}
              games={games}
            />
            <div>
              <p className="eyebrow mb-1.5">Ingest</p>
              <div className="flex items-center gap-2">
                <code className="tabular flex-1 truncate border border-line bg-ink px-2.5 py-2 text-[0.75rem] text-muted">
                  {stream.ingestUrl}
                </code>
                <button className="btn btn-ghost px-2" aria-label="Copy ingest URL">
                  <Copy size={15} />
                </button>
              </div>
              <p className="mt-1.5 text-[0.6875rem] text-faint">
                Your stream key is hidden here on purpose. Reveal it in Settings → Stream key, and
                rotate it if it ever leaves your machine.
              </p>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader eyebrow="Analytics" title="Last 8 sessions" />
          <div className="mb-3 grid grid-cols-2 gap-3">
            <StatTile label="Avg viewers" value={compactNumber(avgViewers)} tone="signal" />
            <StatTile label="Watch hours" value={compactNumber(watchHours)} />
            <StatTile label="Followers gained" value={`+${gained}`} sub={`${compactNumber(followers)} total`} />
            <StatTile label="Subscribers" value={String(subs)} tone="gold" />
          </div>
          <div className="border border-line bg-surface p-3">
            <p className="eyebrow mb-2">Concurrent viewers</p>
            <Spark
              points={sessions.map((session) => session.avgViewers)}
              labels={sessions.length > 1 ? ["oldest", "latest"] : undefined}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader eyebrow="Content" title="Recent VODs" />
          <div className="divide-y divide-line border border-line">
            {stream.vods.map((vod) => (
              <div key={vod.id} className="flex items-center gap-3 bg-surface p-2.5">
                <Thumb seed={vod.id} className="aspect-video w-24 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{vod.title}</p>
                  <p className="tabular text-[0.6875rem] text-faint">
                    {duration(vod.durationSec)} · {compactNumber(vod.views)} views
                  </p>
                </div>
              </div>
            ))}
            {stream.vods.length === 0 && (
              <p className="bg-surface p-4 text-sm text-muted">
                No VODs yet. Recording is on by default once you go live.
              </p>
            )}
          </div>
        </section>

        <section>
          <SectionHeader eyebrow="Clips" title="Top performing" action={{ href: "/studio/highlights", label: "Studio" }} />
          <div className="divide-y divide-line border border-line">
            {stream.clips.map((clip) => (
              <div key={clip.id} className="flex items-center gap-3 bg-surface p-2.5">
                <Thumb seed={clip.slug} className="aspect-[9/16] w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{clip.title}</p>
                  <p className="tabular text-[0.6875rem] text-faint">
                    {compactNumber(clip.views)} views · {compactNumber(clip.likes)} likes
                  </p>
                </div>
                {clip.source !== "MANUAL" && (
                  <Pill tone="signal">auto · heat {clip.heatScore}</Pill>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
