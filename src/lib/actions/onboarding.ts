"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const schema = z.object({
  games: z.array(z.string()).min(1, "Pick at least one game"),
  region: z.string().min(2),
  languages: z.array(z.string()).min(1),
  platforms: z.array(z.string()).min(1),
  goals: z.array(z.string()).min(1, "Pick at least one goal"),
});

export type OnboardingState = { error?: string } | undefined;

export async function completeOnboarding(
  _state: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({
    games: formData.getAll("games").map(String),
    region: String(formData.get("region") ?? ""),
    languages: formData.getAll("languages").map(String),
    platforms: formData.getAll("platforms").map(String),
    goals: formData.getAll("goals").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Fill in every step." };
  }

  const games = await prisma.game.findMany({ where: { slug: { in: parsed.data.games } } });

  await prisma.$transaction([
    prisma.playerPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        region: parsed.data.region,
        languages: parsed.data.languages,
        platforms: parsed.data.platforms,
        goals: parsed.data.goals,
        activeHours: [19, 20, 21, 22],
        preferredRoles: [],
      },
      update: {
        region: parsed.data.region,
        languages: parsed.data.languages,
        platforms: parsed.data.platforms,
        goals: parsed.data.goals,
      },
    }),
    prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, region: parsed.data.region, languages: parsed.data.languages },
      update: { region: parsed.data.region, languages: parsed.data.languages },
    }),
    // A followed game with no rank yet still personalises the feed.
    ...games.map((game) =>
      prisma.gameRank.upsert({
        where: { userId_gameId: { userId: user.id, gameId: game.id } },
        create: { userId: user.id, gameId: game.id, tier: game.rankTiers[0], tierIdx: 0 },
        update: {},
      }),
    ),
    prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } }),
  ]);

  redirect("/home");
}
