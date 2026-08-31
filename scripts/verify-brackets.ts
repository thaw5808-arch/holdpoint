import {
  generateBracket,
  expectedMatchCount,
  roundRobinStandings,
  seedOrder,
} from "../src/lib/brackets";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) { failures++; console.log(`FAIL ${label} ${detail}`); }
  else console.log(`ok   ${label} ${detail}`);
};

check("seedOrder(8)", JSON.stringify(seedOrder(8)) === JSON.stringify([1,8,4,5,2,7,3,6]), JSON.stringify(seedOrder(8)));

for (const n of [4, 8, 16]) {
  for (const format of ["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION", "ROUND_ROBIN"] as const) {
    const matches = generateBracket(format, n);
    check(`${format} n=${n} count`, matches.length === expectedMatchCount(format, n), `${matches.length} vs ${expectedMatchCount(format, n)}`);
    const keys = new Set(matches.map((m) => m.key));
    check(`${format} n=${n} unique keys`, keys.size === matches.length);
    const dangling = matches.flatMap((m) => [m.winnerNext, m.loserNext]).filter((k): k is string => !!k && !keys.has(k));
    check(`${format} n=${n} routing resolves`, dangling.length === 0, dangling.join(","));
    if (format === "DOUBLE_ELIMINATION") {
      // every match except the grand final must route a winner somewhere
      const unrouted = matches.filter((m) => m.side !== "GRAND_FINAL" && !m.winnerNext);
      check(`DE n=${n} winners routed`, unrouted.length === 0, unrouted.map((m) => m.key).join(","));
      // every losers-bracket slot must be fillable exactly twice
      const feedCount = new Map<string, number>();
      for (const m of matches) {
        for (const k of [m.winnerNext, m.loserNext]) if (k) feedCount.set(k, (feedCount.get(k) ?? 0) + 1);
      }
      const wrong = [...feedCount.entries()].filter(([, c]) => c !== 2);
      check(`DE n=${n} every slot fed twice`, wrong.length === 0, JSON.stringify(wrong));
    }
    if (format === "ROUND_ROBIN") {
      const pairs = new Set(matches.map((m) => [m.homeSeed, m.awaySeed].sort((a,b)=>a!-b!).join("-")));
      check(`RR n=${n} every pair once`, pairs.size === matches.length);
    }
  }
}

const standings = roundRobinStandings(
  [
    { homeSeed: 1, awaySeed: 2, homeScore: 2, awayScore: 0 },
    { homeSeed: 3, awaySeed: 4, homeScore: 1, awayScore: 2 },
    { homeSeed: 1, awaySeed: 3, homeScore: 2, awayScore: 1 },
  ],
  4,
);
check("standings leader", standings[0].seed === 1 && standings[0].points === 6, JSON.stringify(standings[0]));

console.log(failures ? `\n${failures} FAILURES` : "\nall bracket checks passed");
process.exit(failures ? 1 : 0);
