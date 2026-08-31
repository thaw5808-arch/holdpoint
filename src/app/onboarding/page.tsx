import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.onboardedAt) redirect("/home");

  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });
  return (
    <OnboardingFlow
      name={user.displayName}
      games={games.map((game) => ({ slug: game.slug, name: game.name, genre: game.genre }))}
    />
  );
}
