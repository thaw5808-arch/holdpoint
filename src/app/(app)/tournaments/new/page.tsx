import { redirect } from "next/navigation";
import { CreateTournamentForm } from "@/components/create-tournament-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function NewTournamentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

  return <CreateTournamentForm games={games.map((game) => ({ slug: game.slug, name: game.name }))} />;
}
