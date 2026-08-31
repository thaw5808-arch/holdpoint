import { redirect } from "next/navigation";
import { CreateTeamForm } from "@/components/create-team-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function NewTeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

  return (
    <CreateTeamForm
      games={games.map((game) => ({ slug: game.slug, name: game.name, shortName: game.shortName }))}
    />
  );
}
