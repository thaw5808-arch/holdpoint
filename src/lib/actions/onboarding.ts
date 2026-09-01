"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { gameRankOps, playerPreferenceOps, setupFieldsSchema } from "@/lib/player-setup";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const schema = setupFieldsSchema.extend({
  games: z.array(z.string()).min(1, "Pick at least one game"),
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
    ...playerPreferenceOps(user.id, parsed.data),
    // A followed game with no rank yet still personalises the feed.
    ...gameRankOps(user.id, games),
    prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } }),
  ]);

  redirect("/home");
}
