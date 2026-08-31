/**
 * Platform progression (spec §19).
 *
 * XP comes from participation that costs the user something. Passive
 * watching is capped per day so idling a stream cannot farm levels, and
 * levels only unlock cosmetics — never competitive advantage.
 */

export const XP_EVENTS = {
  WATCH_30_MIN: 5,
  STREAM_SESSION: 120,
  CLIP_PUBLISHED: 40,
  CLIP_HIT_10K: 250,
  TOURNAMENT_ENTERED: 200,
  MATCH_WON: 90,
  COMMUNITY_POST: 8,
  TEAMMATE_ENDORSEMENT: 60,
} as const;

export const DAILY_PASSIVE_XP_CAP = 60;

/** Cost of the next level rises smoothly; level 100 sits near 1.2M XP. */
export function xpForLevel(level: number) {
  if (level <= 1) return 0;
  return Math.round(80 * (level - 1) ** 2 + 120 * (level - 1));
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 500) level++;
  return level;
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  return {
    level,
    into: xp - floor,
    needed: ceiling - floor,
    percent: Math.round(((xp - floor) / (ceiling - floor)) * 100),
  };
}

export const COSMETIC_UNLOCKS: { level: number; label: string }[] = [
  { level: 10, label: "Profile accent colours" },
  { level: 25, label: "Animated rank frame" },
  { level: 50, label: "Custom banner treatments" },
  { level: 100, label: "Emblem foil finish" },
  { level: 150, label: "Founder wordmark" },
];
