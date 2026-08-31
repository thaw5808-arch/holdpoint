/**
 * Play compatibility (spec §12).
 *
 * Deliberately not a black box: every factor is a named, bounded rule and
 * the UI renders the same reasons this function scores on. Weights live
 * here and nowhere else.
 *
 * Region is the one exception to "weight": it's a gate, not a line item —
 * see REGION_GATE below.
 */

// Rescaled from the original 26/22/16/10/8/6 (which summed to 88, back when
// region was a 7th, additive, 12-point line item) up to sum to 100 at the
// same relative proportions, so a perfect same-region match can reach 100%
// and region — now a pure multiplicative gate below — is the only thing
// that can take a same-region score below what these six add up to.
export const COMPATIBILITY_WEIGHTS = {
  sharedGames: 30,
  skill: 25,
  schedule: 18,
  roles: 11,
  language: 9,
  intensity: 7,
} as const;

/**
 * Region gates the final score instead of adding/losing a fixed number of
 * points: latency isn't a soft preference the way a shared active hour is,
 * so a cross-region pair has their whole score multiplied down rather than
 * merely docked 12 points out of a much larger total. That keeps them
 * visible in results (so a great cross-region match can still surface) but
 * stops them from ever outranking someone the user could actually queue
 * with, which a flat point penalty didn't reliably do.
 *
 * "adjacent" only fires when both region strings share a leading word
 * ("NA East" / "NA West", "EU West" / "EU East") — that's a heuristic on
 * the string format, not a real geography or latency table. Single-token
 * regions (SEA, OCE, KR, …) have no substructure to compare, so any pair
 * touching one of those always falls to "distant". Known limitation, not
 * a bug: fixing it properly needs an actual region-adjacency table.
 */
const REGION_GATE = { adjacent: 0.6, distant: 0.5 } as const;

export type CompatibilityFactor = keyof typeof COMPATIBILITY_WEIGHTS;

export interface PlayerSnapshot {
  region: string;
  languages: string[];
  competitive: number; // 0–100
  activeHours: number[]; // 0–23
  micRequired: boolean;
  ranks: { gameId: string; tierIdx: number; tierCount: number; role?: string | null }[];
  preferredRoles: string[];
}

export interface CompatibilityResult {
  score: number;
  reasons: string[];
  breakdown: { factor: CompatibilityFactor | "region"; earned: number; max: number; note: string }[];
}

const overlap = <T,>(a: T[], b: T[]) => a.filter((item) => b.includes(item));

export function playCompatibility(
  a: PlayerSnapshot,
  b: PlayerSnapshot,
  gameNames: Record<string, string> = {},
): CompatibilityResult {
  const breakdown: CompatibilityResult["breakdown"] = [];
  const reasons: string[] = [];

  // Shared games — the whole thing is pointless without at least one.
  const aGames = a.ranks.map((r) => r.gameId);
  const bGames = b.ranks.map((r) => r.gameId);
  const shared = overlap(aGames, bGames);
  const sharedRatio = shared.length / Math.max(1, Math.min(aGames.length, bGames.length));
  const sharedEarned = Math.round(COMPATIBILITY_WEIGHTS.sharedGames * Math.min(1, sharedRatio));
  breakdown.push({
    factor: "sharedGames",
    earned: sharedEarned,
    max: COMPATIBILITY_WEIGHTS.sharedGames,
    note: shared.length ? `${shared.length} game${shared.length > 1 ? "s" : ""} in common` : "No games in common",
  });
  if (shared.length) {
    const named = shared.map((id) => gameNames[id]).filter(Boolean);
    reasons.push(named.length ? `Both play ${named.slice(0, 2).join(" and ")}` : "Shared games");
  }

  // Skill — rank gap across every shared game, normalised by each ladder's
  // length, then averaged (not the closest-game minimum). Taking the best
  // game alone let one coincidental near-match fully mask a real mismatch
  // in another shared game, so a pairing that couldn't actually queue
  // together in their main game could still walk away with a perfect
  // skill score by way of an unrelated secondary game.
  let gapTotal = 0;
  for (const gameId of shared) {
    const ra = a.ranks.find((r) => r.gameId === gameId)!;
    const rb = b.ranks.find((r) => r.gameId === gameId)!;
    gapTotal += Math.abs(ra.tierIdx - rb.tierIdx) / Math.max(1, ra.tierCount - 1);
  }
  const avgGap = shared.length ? gapTotal / shared.length : 1;
  // Smoothstep the gap-to-credit curve instead of a straight line: a small
  // gap should barely cost anything, but a large one needs to collapse
  // toward zero credit much faster than linear, not taper off gently —
  // a straight line was still handing out ~1/3 credit at a gap most
  // players would never queue across.
  const scaledGap = Math.min(1, avgGap * 2.2);
  const gapCost = scaledGap * scaledGap * (3 - 2 * scaledGap);
  const skillEarned = shared.length
    ? Math.round(COMPATIBILITY_WEIGHTS.skill * (1 - gapCost))
    : 0;
  breakdown.push({
    factor: "skill",
    earned: skillEarned,
    max: COMPATIBILITY_WEIGHTS.skill,
    note: shared.length
      ? `${Math.round(avgGap * 100)}% avg rank gap across ${shared.length} shared game${shared.length > 1 ? "s" : ""}`
      : "No shared ladder",
  });
  if (shared.length && avgGap <= 0.12) reasons.push("Similar rank");

  // Schedule — overlapping active hours.
  const hours = overlap(a.activeHours, b.activeHours);
  const scheduleEarned = Math.round(
    COMPATIBILITY_WEIGHTS.schedule * Math.min(1, hours.length / 4),
  );
  breakdown.push({
    factor: "schedule",
    earned: scheduleEarned,
    max: COMPATIBILITY_WEIGHTS.schedule,
    note: `${hours.length}h of overlapping play time`,
  });
  if (hours.length >= 3) reasons.push("Same active hours");

  // Roles — complementary beats identical.
  const roleClash = overlap(a.preferredRoles, b.preferredRoles).length;
  const complementary = a.preferredRoles.length && b.preferredRoles.length && roleClash === 0;
  const rolesEarned = complementary
    ? COMPATIBILITY_WEIGHTS.roles
    : Math.round(COMPATIBILITY_WEIGHTS.roles * 0.4);
  breakdown.push({
    factor: "roles",
    earned: rolesEarned,
    max: COMPATIBILITY_WEIGHTS.roles,
    note: complementary ? "Complementary roles" : "Overlapping role preferences",
  });
  if (complementary) reasons.push("Complementary roles");

  // Language.
  const langs = overlap(a.languages, b.languages);
  breakdown.push({
    factor: "language",
    earned: langs.length ? COMPATIBILITY_WEIGHTS.language : 0,
    max: COMPATIBILITY_WEIGHTS.language,
    note: langs.length ? `Speaks ${langs[0]}` : "No shared language",
  });
  if (langs.length) reasons.push(`Both speak ${langs[0]}`);

  // Competitive intensity + mic expectations.
  const intensityGap = Math.abs(a.competitive - b.competitive) / 100;
  let intensityEarned = Math.round(COMPATIBILITY_WEIGHTS.intensity * (1 - intensityGap));
  if (a.micRequired !== b.micRequired) intensityEarned = Math.max(0, intensityEarned - 3);
  breakdown.push({
    factor: "intensity",
    earned: intensityEarned,
    max: COMPATIBILITY_WEIGHTS.intensity,
    note:
      intensityGap <= 0.2
        ? "Similar competitive intensity"
        : "Different competitive intensity",
  });
  if (intensityGap <= 0.15 && a.micRequired === b.micRequired) {
    reasons.push(a.competitive >= 60 ? "Both play to win" : "Both play casually");
  }

  // Region gate — applied last, to the total the six factors above already
  // earned. Same region: no adjustment. Cross region: multiply the whole
  // thing down (see REGION_GATE) instead of docking a fixed number of
  // points, so a large-enough mismatch elsewhere can't be papered over by
  // simply being in the same region, and a good cross-region match still
  // can't outrank one the user could actually play with.
  const rawScore = breakdown.reduce((total, row) => total + row.earned, 0);
  const sameRegion = a.region === b.region;
  const adjacentRegion = !sameRegion && a.region.split(" ")[0] === b.region.split(" ")[0];
  const regionMultiplier = sameRegion ? 1 : adjacentRegion ? REGION_GATE.adjacent : REGION_GATE.distant;
  const gatedScore = Math.round(rawScore * regionMultiplier);
  const regionCutPct = Math.round((1 - regionMultiplier) * 100);
  breakdown.push({
    factor: "region",
    earned: gatedScore - rawScore,
    max: 0,
    note: sameRegion
      ? `Both on ${a.region}`
      : `${a.region} vs ${b.region} — score cut ${regionCutPct}% for crossing regions`,
  });
  if (sameRegion) {
    reasons.push(`Same region (${a.region})`);
  } else {
    reasons.unshift(`${a.region} vs ${b.region} — score cut ${regionCutPct}% for crossing regions`);
  }

  const score = breakdown.reduce((total, row) => total + row.earned, 0);
  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 4), breakdown };
}
