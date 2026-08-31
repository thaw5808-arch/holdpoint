import { playCompatibility } from "../src/lib/compatibility";
import { levelFromXp, levelProgress, xpForLevel } from "../src/lib/progression";
import { detectHighlights } from "../src/lib/highlights";

const base = {
  region: "SEA",
  languages: ["en", "th"],
  competitive: 70,
  activeHours: [19, 20, 21, 22],
  micRequired: true,
  preferredRoles: ["Anchor"],
  ranks: [{ gameId: "g1", tierIdx: 6, tierCount: 9, role: "Anchor" }],
};
const twin = { ...base, preferredRoles: ["Duelist"] };
const opposite = {
  region: "EU West",
  languages: ["de"],
  competitive: 10,
  activeHours: [3, 4],
  micRequired: false,
  preferredRoles: ["Anchor"],
  ranks: [{ gameId: "g2", tierIdx: 1, tierCount: 9, role: "Recon" }],
};

const good = playCompatibility(base, twin, { g1: "Ashfall" });
const bad = playCompatibility(base, opposite, { g1: "Ashfall" });
console.log("near-ideal:", good.score, good.reasons);
console.log("mismatch  :", bad.score, bad.reasons);
console.log("bounded   :", good.score <= 100 && bad.score >= 0 && good.score > bad.score);

console.log("level 1 xp:", xpForLevel(1), "level 10:", xpForLevel(10), "level 100:", xpForLevel(100));
console.log("levelFromXp round trip:", [1, 10, 50, 150].every((l) => levelFromXp(xpForLevel(l)) === l));
console.log("progress@96500:", levelProgress(96_500));

const telemetry = Array.from({ length: 300 }, (_, second) => ({
  second,
  chatMessages: second === 120 ? 60 : second === 200 ? 8 : 6,
  viewers: second > 195 ? 2400 : 1800,
  gameEvent: second === 250 ? ("MATCH_WON" as const) : undefined,
}));
console.log("highlights:", detectHighlights(telemetry));
