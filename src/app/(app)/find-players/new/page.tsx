import { redirect } from "next/navigation";
import { CreateLFGPostForm } from "@/components/create-lfg-post-form";
import { prisma } from "@/lib/prisma";
import { REGIONS } from "@/lib/regions";
import { LANGUAGES } from "@/lib/languages";
import { getCurrentUser } from "@/lib/session";

export default async function NewLFGPostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [games, preference] = await Promise.all([
    prisma.game.findMany({ orderBy: { name: "asc" } }),
    prisma.playerPreference.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <CreateLFGPostForm
      games={games.map((game) => ({
        slug: game.slug,
        name: game.name,
        rankTiers: game.rankTiers,
        roles: game.roles,
      }))}
      defaultRegion={preference?.region ?? REGIONS[0]}
      defaultLanguage={preference?.languages[0] ?? LANGUAGES[0]}
    />
  );
}
