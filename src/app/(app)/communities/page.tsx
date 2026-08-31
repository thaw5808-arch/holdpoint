import Link from "next/link";
import { Emblem } from "@/components/emblem";
import { Pill, SectionHeader } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function CommunitiesPage() {
  const communities = await prisma.community.findMany({
    where: { isPublic: true },
    include: { game: true, _count: { select: { members: true, channels: true } } },
    orderBy: { memberCount: "desc" },
  });

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-5 sm:px-5">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Communities</p>
          <h1 className="display text-xl uppercase tracking-[0.05em]">Where people stay</h1>
          <p className="mt-1 max-w-lg text-sm text-muted">
            Channels, voice rooms and events that keep running when nobody is live.
          </p>
        </div>
        <Link href="/communities/new" className="btn btn-primary">
          Create community
        </Link>
      </div>

      <SectionHeader eyebrow={`${communities.length} public`} title="Browse" />
      <div className="grid gap-3 sm:grid-cols-2">
        {communities.map((community) => (
          <Link
            key={community.id}
            href={`/communities/${community.slug}`}
            className="tick flex gap-3 border border-line bg-surface p-4"
          >
            <Emblem seed={community.slug} tag={community.name.slice(0, 3)} size={48} />
            <div className="min-w-0">
              <h2 className="display truncate text-sm uppercase tracking-[0.04em]">{community.name}</h2>
              <p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-muted">{community.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {community.game && <Pill tone="signal">{community.game.shortName}</Pill>}
                <span className="tabular text-[0.6875rem] text-faint">
                  {compactNumber(community._count.members)} members · {community._count.channels} channels
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
