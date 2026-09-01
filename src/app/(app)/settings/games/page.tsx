import { redirect } from "next/navigation";
import { GameRankList } from "@/components/game-rank-list";
import { GamesPickerForm } from "@/components/settings-games-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function SettingsGamesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [allGames, ranks] = await Promise.all([
    prisma.game.findMany({ orderBy: { name: "asc" } }),
    prisma.gameRank.findMany({ where: { userId: user.id }, include: { game: true }, orderBy: { game: { name: "asc" } } }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="display mb-1 text-base uppercase tracking-[0.05em]">Your games</h2>
        <p className="mb-4 text-sm text-muted">
          Adding a game starts it at the lowest rank below. Removing one drops whatever rank you&apos;d set for it.
        </p>
        <GamesPickerForm
          games={allGames.map((game) => ({ slug: game.slug, name: game.name, genre: game.genre }))}
          pickedSlugs={ranks.map((rank) => rank.game.slug)}
        />
      </section>

      <section className="border-t border-line pt-8">
        <h2 className="display mb-1 text-base uppercase tracking-[0.05em]">Rank per game</h2>
        <p className="mb-4 text-sm text-muted">Shows on your profile next to each game.</p>
        <GameRankList
          ranks={ranks.map((rank) => ({
            gameSlug: rank.game.slug,
            gameName: rank.game.name,
            tier: rank.tier,
            role: rank.role,
            rankTiers: rank.game.rankTiers,
            roles: rank.game.roles,
          }))}
        />
      </section>
    </div>
  );
}
