import { redirect } from "next/navigation";
import { CreateCommunityForm } from "@/components/create-community-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function NewCommunityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

  return (
    <CreateCommunityForm games={games.map((game) => ({ slug: game.slug, name: game.name }))} />
  );
}
