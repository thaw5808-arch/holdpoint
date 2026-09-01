import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * The "region / languages / platforms / goals" write path — shared between
 * onboarding's completeOnboarding and settings' updatePreferencesAction so
 * there's exactly one place that knows PlayerPreference and Profile both
 * carry region/languages and need to stay in sync. Callers own the
 * transaction (onboarding folds this into a bigger one with the game ranks
 * and onboardedAt; settings runs it alone), so this returns unexecuted
 * PrismaPromises rather than awaiting them itself.
 */
export const setupFieldsSchema = z.object({
  region: z.string().trim().min(2, "Pick a region"),
  languages: z.array(z.string()).min(1, "Pick at least one language"),
  platforms: z.array(z.string()).min(1, "Pick at least one platform"),
  goals: z.array(z.string()).min(1, "Pick at least one goal"),
});
export type SetupFields = z.infer<typeof setupFieldsSchema>;

export function playerPreferenceOps(userId: string, data: SetupFields) {
  return [
    prisma.playerPreference.upsert({
      where: { userId },
      create: {
        userId,
        region: data.region,
        languages: data.languages,
        platforms: data.platforms,
        goals: data.goals,
        activeHours: [19, 20, 21, 22],
        preferredRoles: [],
      },
      update: {
        region: data.region,
        languages: data.languages,
        platforms: data.platforms,
        goals: data.goals,
      },
    }),
    prisma.profile.upsert({
      where: { userId },
      create: { userId, region: data.region, languages: data.languages },
      update: { region: data.region, languages: data.languages },
    }),
  ];
}

/**
 * Ensures a GameRank row exists — at the game's lowest tier — for every
 * game passed in. Never touches an existing row (update: {}), so re-saving
 * a game the user already added, from onboarding or from settings, can't
 * clobber a rank they've since set. Removing a game is a separate,
 * caller-owned deleteMany — this only ever adds.
 */
export function gameRankOps(userId: string, games: { id: string; rankTiers: string[] }[]) {
  return games.map((game) =>
    prisma.gameRank.upsert({
      where: { userId_gameId: { userId, gameId: game.id } },
      create: { userId, gameId: game.id, tier: game.rankTiers[0], tierIdx: 0 },
      update: {},
    }),
  );
}
