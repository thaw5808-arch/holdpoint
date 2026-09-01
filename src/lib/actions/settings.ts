"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { gameRankOps, playerPreferenceOps, setupFieldsSchema } from "@/lib/player-setup";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * Every settings mutation revalidates the same three places: the settings
 * page itself (so the form reflects what just saved), the public profile
 * (where games/rank/region/languages/bio actually render), and home (whose
 * "Recommended players" scoring reads games/region/languages too).
 */
function revalidateAfterProfileEdit(username: string) {
  revalidatePath("/settings", "layout");
  revalidatePath(`/u/${username}`);
  revalidatePath("/home");
}

const profileBasicsSchema = z.object({
  displayName: z.string().trim().min(2, "Use at least 2 characters").max(32, "Keep it under 32 characters"),
  bio: z.string().trim().max(300, "Keep it under 300 characters"),
});

export type UpdateProfileBasicsResult = { saved: true } | { error: string };

export async function updateProfileBasicsAction(
  displayName: string,
  bio: string,
): Promise<UpdateProfileBasicsResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = profileBasicsSchema.safeParse({ displayName, bio });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check those fields." };

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { displayName: parsed.data.displayName } }),
    prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, bio: parsed.data.bio || null },
      update: { bio: parsed.data.bio || null },
    }),
  ]);

  revalidateAfterProfileEdit(user.username);
  return { saved: true };
}

const gamesSchema = z.object({ games: z.array(z.string()).min(1, "Pick at least one game") });

export type UpdateGamesState = { error: string } | { saved: true } | undefined;

/**
 * Saves the user's full game set. Games newly checked get a GameRank row
 * at the game's lowest tier (same gameRankOps onboarding uses); games
 * unchecked have their GameRank — and whatever rank the user had set —
 * deleted outright, since there's nowhere else for a rank to live once its
 * game is gone (see the GameRank model comment: no history, one row per
 * user+game).
 */
export async function updateGamesAction(_state: UpdateGamesState, formData: FormData): Promise<UpdateGamesState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = gamesSchema.safeParse({ games: formData.getAll("games").map(String) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Pick at least one game." };

  const games = await prisma.game.findMany({ where: { slug: { in: parsed.data.games } } });
  if (games.length === 0) return { error: "Pick at least one game." };

  const current = await prisma.gameRank.findMany({ where: { userId: user.id }, select: { gameId: true } });
  const nextIds = new Set(games.map((game) => game.id));
  const toRemove = current.map((rank) => rank.gameId).filter((gameId) => !nextIds.has(gameId));

  await prisma.$transaction([
    ...gameRankOps(user.id, games),
    ...(toRemove.length > 0
      ? [prisma.gameRank.deleteMany({ where: { userId: user.id, gameId: { in: toRemove } } })]
      : []),
  ]);

  revalidateAfterProfileEdit(user.username);
  return { saved: true };
}

const rankInput = z.object({
  gameSlug: z.string().min(1),
  tier: z.string().min(1),
  role: z.string().nullable(),
});

export type UpdateGameRankResult = { saved: true } | { error: string };

/**
 * Sets tier + role for a game the user has already added. Deliberately
 * requires an existing GameRank row rather than upserting one — upserting
 * would let this double as a back door for adding a game without it ever
 * going through updateGamesAction's picker, which is the only place a
 * GameRank is supposed to come into existence from settings.
 */
export async function updateGameRankAction(
  gameSlug: string,
  tier: string,
  role: string | null,
): Promise<UpdateGameRankResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = rankInput.safeParse({ gameSlug, tier, role });
  if (!parsed.success) return { error: "Invalid rank." };

  const game = await prisma.game.findUnique({ where: { slug: parsed.data.gameSlug } });
  if (!game) return { error: "Unknown game." };

  const tierIdx = game.rankTiers.indexOf(parsed.data.tier);
  if (tierIdx === -1) return { error: "Pick a valid rank." };
  if (parsed.data.role && !game.roles.includes(parsed.data.role)) return { error: "Pick a valid role." };

  const existing = await prisma.gameRank.findUnique({
    where: { userId_gameId: { userId: user.id, gameId: game.id } },
  });
  if (!existing) return { error: "Add this game before setting a rank." };

  await prisma.gameRank.update({
    where: { id: existing.id },
    data: { tier: parsed.data.tier, tierIdx, role: parsed.data.role },
  });

  revalidateAfterProfileEdit(user.username);
  return { saved: true };
}

export type UpdatePreferencesState = { error: string } | { saved: true } | undefined;

export async function updatePreferencesAction(
  _state: UpdatePreferencesState,
  formData: FormData,
): Promise<UpdatePreferencesState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = setupFieldsSchema.safeParse({
    region: String(formData.get("region") ?? ""),
    languages: formData.getAll("languages").map(String),
    platforms: formData.getAll("platforms").map(String),
    goals: formData.getAll("goals").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check those fields." };
  }

  await prisma.$transaction(playerPreferenceOps(user.id, parsed.data));

  revalidateAfterProfileEdit(user.username);
  return { saved: true };
}
