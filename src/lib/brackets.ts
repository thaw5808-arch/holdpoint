/**
 * Bracket generation.
 *
 * Every format produces the same shape: a flat list of match specs with
 * stable (side, round, position) coordinates and explicit winner/loser
 * routing, so the bracket viewer and the result reporter can both work
 * off coordinates instead of guessing structure at render time.
 */

export type BracketSide = "WINNERS" | "LOSERS" | "GRAND_FINAL" | "GROUP";

export interface MatchSpec {
  key: string; // `${side}-${round}-${position}`
  side: BracketSide;
  round: number;
  position: number;
  /** Seed numbers when known at generation time (1-indexed). */
  homeSeed?: number;
  awaySeed?: number;
  /** Key of the match the winner advances into. */
  winnerNext?: string;
  /** Key of the match the loser drops into (double elimination only). */
  loserNext?: string;
  isBye?: boolean;
}

const key = (side: BracketSide, round: number, position: number) =>
  `${side}-${round}-${position}`;

export function nextPowerOfTwo(n: number) {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(2, size);
}

/**
 * Standard seed placement: 1 always meets the lowest surviving seed.
 * Size 8 → [1, 8, 4, 5, 2, 7, 3, 6].
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const doubled = order.length * 2;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed, doubled + 1 - seed);
    }
    order = next;
  }
  return order;
}

export function singleElimination(teamCount: number): MatchSpec[] {
  const size = nextPowerOfTwo(teamCount);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches: MatchSpec[] = [];

  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position++) {
      const spec: MatchSpec = {
        key: key("WINNERS", round, position),
        side: "WINNERS",
        round,
        position,
      };
      if (round === 1) {
        const home = order[position * 2];
        const away = order[position * 2 + 1];
        spec.homeSeed = home <= teamCount ? home : undefined;
        spec.awaySeed = away <= teamCount ? away : undefined;
        spec.isBye = !spec.homeSeed || !spec.awaySeed;
      }
      if (round < rounds) {
        spec.winnerNext = key("WINNERS", round + 1, Math.floor(position / 2));
      }
      matches.push(spec);
    }
  }
  return matches;
}

/**
 * Double elimination. Assumes a power-of-two entrant count; call
 * `nextPowerOfTwo` and fill with byes before generating.
 *
 * Losers bracket alternates minor rounds (survivors pair off) and major
 * rounds (survivors meet a fresh drop from the winners bracket). Winners
 * bracket losers are cross-mapped into the losers bracket in reverse
 * position order, which is what keeps early rematches out of the bracket.
 */
export function doubleElimination(teamCount: number): MatchSpec[] {
  const size = nextPowerOfTwo(teamCount);
  const wbRounds = Math.log2(size);
  const matches: MatchSpec[] = [];
  const byKey = new Map<string, MatchSpec>();

  const push = (spec: MatchSpec) => {
    matches.push(spec);
    byKey.set(spec.key, spec);
  };

  // Winners bracket
  const wb = singleElimination(teamCount).map((m) => ({ ...m }));
  wb.forEach(push);

  // Losers bracket round sizes: n/4, n/4, n/8, n/8, … , 1, 1
  const lbCounts: number[] = [];
  let count = size / 4;
  for (let j = 1; j <= 2 * (wbRounds - 1); j++) {
    lbCounts.push(count);
    if (j % 2 === 0) count = Math.max(1, count / 2);
  }

  lbCounts.forEach((matchCount, index) => {
    const round = index + 1;
    for (let position = 0; position < matchCount; position++) {
      const spec: MatchSpec = {
        key: key("LOSERS", round, position),
        side: "LOSERS",
        round,
        position,
      };
      if (round < lbCounts.length) {
        const nextCount = lbCounts[round];
        // Odd (minor) rounds feed a same-size major round 1:1; even
        // (major) rounds feed a half-size minor round by pairing.
        spec.winnerNext =
          nextCount === matchCount
            ? key("LOSERS", round + 1, position)
            : key("LOSERS", round + 1, Math.floor(position / 2));
      } else {
        spec.winnerNext = key("GRAND_FINAL", 1, 0);
      }
      push(spec);
    }
  });

  // Route winners-bracket losers down.
  for (let round = 1; round <= wbRounds; round++) {
    const wbCount = size / 2 ** round;
    const targetRound = round === 1 ? 1 : 2 * round - 2;
    for (let position = 0; position < wbCount; position++) {
      const source = byKey.get(key("WINNERS", round, position));
      if (!source) continue;
      if (round === wbRounds) {
        source.loserNext = key("LOSERS", lbCounts.length, 0);
        source.winnerNext = key("GRAND_FINAL", 1, 0);
        continue;
      }
      const targetCount = lbCounts[targetRound - 1];
      const targetPosition =
        round === 1
          ? Math.floor(position / 2)
          : targetCount - 1 - position; // reverse cross-map
      source.loserNext = key("LOSERS", targetRound, targetPosition);
    }
  }

  push({ key: key("GRAND_FINAL", 1, 0), side: "GRAND_FINAL", round: 1, position: 0 });

  return matches;
}

export function roundRobin(teamCount: number): MatchSpec[] {
  const teams = Array.from({ length: teamCount }, (_, i) => i + 1);
  if (teams.length % 2 === 1) teams.push(0); // 0 = bye slot
  const half = teams.length / 2;
  const rotation = teams.slice(1);
  const matches: MatchSpec[] = [];

  for (let round = 1; round <= teams.length - 1; round++) {
    const ordered = [teams[0], ...rotation];
    let position = 0;
    for (let i = 0; i < half; i++) {
      const home = ordered[i];
      const away = ordered[ordered.length - 1 - i];
      if (home === 0 || away === 0) continue;
      matches.push({
        key: key("GROUP", round, position),
        side: "GROUP",
        round,
        position,
        homeSeed: home,
        awaySeed: away,
      });
      position++;
    }
    rotation.unshift(rotation.pop()!);
  }
  return matches;
}

export function generateBracket(
  format: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN",
  teamCount: number,
): MatchSpec[] {
  if (format === "ROUND_ROBIN") return roundRobin(teamCount);
  if (format === "DOUBLE_ELIMINATION") return doubleElimination(teamCount);
  return singleElimination(teamCount);
}

export interface Standing {
  seed: number;
  played: number;
  wins: number;
  losses: number;
  points: number;
  roundDiff: number;
}

export function roundRobinStandings(
  results: { homeSeed: number; awaySeed: number; homeScore: number; awayScore: number }[],
  teamCount: number,
): Standing[] {
  const table = new Map<number, Standing>();
  for (let seed = 1; seed <= teamCount; seed++) {
    table.set(seed, { seed, played: 0, wins: 0, losses: 0, points: 0, roundDiff: 0 });
  }
  for (const r of results) {
    const home = table.get(r.homeSeed);
    const away = table.get(r.awaySeed);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.roundDiff += r.homeScore - r.awayScore;
    away.roundDiff += r.awayScore - r.homeScore;
    if (r.homeScore > r.awayScore) {
      home.wins++;
      home.points += 3;
      away.losses++;
    } else if (r.awayScore > r.homeScore) {
      away.wins++;
      away.points += 3;
      home.losses++;
    } else {
      home.points++;
      away.points++;
    }
  }
  return [...table.values()].sort(
    (a, b) => b.points - a.points || b.roundDiff - a.roundDiff || a.seed - b.seed,
  );
}

export function expectedMatchCount(
  format: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN",
  teamCount: number,
) {
  if (format === "ROUND_ROBIN") return (teamCount * (teamCount - 1)) / 2;
  const size = nextPowerOfTwo(teamCount);
  return format === "DOUBLE_ELIMINATION" ? 2 * size - 2 : size - 1;
}
