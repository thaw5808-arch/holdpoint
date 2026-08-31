"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const schema = z
  .object({
    game: z.string().trim().min(1, "Pick a game"),
    body: z.string().trim().min(1, "Say what you're looking for").max(280, "Keep it under 280 characters"),
    needed: z.coerce
      .number()
      .int()
      .min(1, "Need at least 1 more player")
      .max(9, "That's more than most rosters hold"),
    minTier: z.string().trim().optional(),
    maxTier: z.string().trim().optional(),
    region: z.string().trim().min(2, "Pick a region"),
    platform: z.string().trim().optional(),
    language: z.string().trim().min(2, "Pick a language"),
    role: z.string().trim().optional(),
    competitive: z.boolean(),
    micRequired: z.boolean(),
    playsAt: z.string().trim().optional(),
  })
  .transform((value) => ({
    ...value,
    minTier: value.minTier || undefined,
    maxTier: value.maxTier || undefined,
    platform: value.platform || undefined,
    role: value.role || undefined,
    playsAt: value.playsAt || undefined,
  }));

type LFGField =
  | "game"
  | "body"
  | "needed"
  | "minTier"
  | "maxTier"
  | "region"
  | "platform"
  | "language"
  | "role"
  | "playsAt";

export type LFGFormState = { error?: string; fieldErrors?: Partial<Record<LFGField, string>> } | undefined;

/**
 * Creates an LFG post. Rank range and role are validated against the
 * chosen game's own rankTiers/roles rather than accepted as free text —
 * the form only ever offers that game's options, but a direct call
 * shouldn't be able to smuggle in a tier or role from a different game.
 */
export async function createLFGPostAction(
  _state: LFGFormState,
  formData: FormData,
): Promise<LFGFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({
    game: formData.get("game"),
    body: formData.get("body"),
    needed: formData.get("needed"),
    minTier: formData.get("minTier") ?? "",
    maxTier: formData.get("maxTier") ?? "",
    region: formData.get("region"),
    platform: formData.get("platform") ?? "",
    language: formData.get("language"),
    role: formData.get("role") ?? "",
    competitive: formData.get("competitive") === "on",
    micRequired: formData.get("micRequired") === "on",
    playsAt: formData.get("playsAt") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (typeof field === "string") {
      return { fieldErrors: { [field as LFGField]: issue.message } };
    }
    return { error: "Check the form and try again." };
  }
  const data = parsed.data;

  const game = await prisma.game.findUnique({ where: { slug: data.game } });
  if (!game) return { fieldErrors: { game: "Pick a game." } };

  if (data.minTier && !game.rankTiers.includes(data.minTier)) {
    return { fieldErrors: { minTier: "Not a rank in this game." } };
  }
  if (data.maxTier && !game.rankTiers.includes(data.maxTier)) {
    return { fieldErrors: { maxTier: "Not a rank in this game." } };
  }
  if (
    data.minTier &&
    data.maxTier &&
    game.rankTiers.indexOf(data.minTier) > game.rankTiers.indexOf(data.maxTier)
  ) {
    return { fieldErrors: { maxTier: "Max rank can't be below min rank." } };
  }
  if (data.role && !game.roles.includes(data.role)) {
    return { fieldErrors: { role: "Not a role in this game." } };
  }

  let playsAt: Date | null = null;
  if (data.playsAt) {
    const parsedDate = new Date(data.playsAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return { fieldErrors: { playsAt: "That doesn't look like a valid time." } };
    }
    playsAt = parsedDate;
  }

  await prisma.lFGPost.create({
    data: {
      userId: user.id,
      gameId: game.id,
      body: data.body,
      needed: data.needed,
      minTier: data.minTier ?? null,
      maxTier: data.maxTier ?? null,
      region: data.region,
      platform: data.platform ?? null,
      language: data.language,
      role: data.role ?? null,
      competitive: data.competitive,
      micRequired: data.micRequired,
      playsAt,
    },
  });

  revalidatePath("/find-players");
  redirect("/find-players");
}

export type CloseLFGPostResult = { closed: true } | { error: string };

/** Closes (not deletes) an LFG post — the schema's `open` flag exists for
 * exactly this, but nothing set it to false before this action. Author
 * only, re-checked here rather than trusted from whichever page rendered
 * the Close button. */
export async function closeLFGPostAction(postId: string): Promise<CloseLFGPostResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const post = await prisma.lFGPost.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, open: true },
  });
  if (!post) return { error: "That post no longer exists." };
  if (post.userId !== user.id) return { error: "You can only close your own posts." };

  if (post.open) {
    await prisma.lFGPost.update({ where: { id: post.id }, data: { open: false } });
    revalidatePath("/find-players");
  }
  return { closed: true };
}
