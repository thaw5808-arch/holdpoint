/**
 * Deterministic generated artwork.
 *
 * The product ships no borrowed game covers, team logos or creator photos.
 * Every visual identity in the app is derived from a stable seed string,
 * so a channel, team or game always renders the same art everywhere.
 */

export function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function pick<T>(seed: string, list: readonly T[], salt = 0): T {
  return list[(hash(seed) + salt * 7919) % list.length];
}

/** Restricted to the product palette so generated art never fights the UI. */
const HUES = [78, 92, 46, 168, 196, 24, 340] as const;

export function seededColor(seed: string, salt = 0, lightness = 52) {
  const hue = HUES[(hash(seed) + salt * 31) % HUES.length];
  const sat = 46 + ((hash(seed + salt) % 3) * 12);
  return `hsl(${hue} ${sat}% ${lightness}%)`;
}

export function coverGradient(seed: string) {
  const a = seededColor(seed, 0, 30);
  const b = seededColor(seed, 1, 14);
  const angle = 90 + (hash(seed) % 140);
  return `linear-gradient(${angle}deg, ${a}, ${b})`;
}

export function initials(name: string) {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}
