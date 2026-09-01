"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Crosshair } from "lucide-react";
import { Emblem } from "@/components/emblem";
import { MatchResultActions } from "@/components/match-result-actions";

export interface BracketMatch {
  id: string;
  side: "WINNERS" | "LOSERS" | "GRAND_FINAL" | "GROUP";
  round: number;
  position: number;
  state: string;
  bestOf: number;
  homeScore: number;
  awayScore: number;
  home: { id: string; name: string; tag: string; slug: string } | null;
  away: { id: string; name: string; tag: string; slug: string } | null;
  winnerNextId: string | null;
  scheduledAt: string | null;
  /** userId of whoever reported the pending result, if any — lets the
   * panel tell the reporter apart from the team waiting to respond. */
  resultReportedById: string | null;
}

const CARD_W = 208;
const CARD_H = 66;
const GAP_X = 76;
const GAP_Y = 22;

function layout(matches: BracketMatch[]) {
  const bySide = new Map<string, BracketMatch[]>();
  for (const match of matches) {
    const key = match.side;
    if (!bySide.has(key)) bySide.set(key, []);
    bySide.get(key)!.push(match);
  }

  const points = new Map<string, { x: number; y: number }>();
  let offsetY = 0;
  const order = ["WINNERS", "LOSERS", "GRAND_FINAL", "GROUP"];

  for (const side of order) {
    const group = bySide.get(side);
    if (!group) continue;
    const rounds = [...new Set(group.map((m) => m.round))].sort((a, b) => a - b);
    const firstRoundCount = group.filter((m) => m.round === rounds[0]).length;

    for (const round of rounds) {
      const inRound = group.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
      const spacing = ((CARD_H + GAP_Y) * firstRoundCount) / inRound.length;
      inRound.forEach((match, index) => {
        points.set(match.id, {
          x: (round - 1) * (CARD_W + GAP_X),
          y: offsetY + index * spacing + (spacing - CARD_H) / 2,
        });
      });
    }
    offsetY += (CARD_H + GAP_Y) * firstRoundCount + 56;
  }

  const width = Math.max(...[...points.values()].map((p) => p.x)) + CARD_W + 40;
  const height = offsetY + 20;
  return { points, width, height };
}

export function BracketView({
  matches,
  viewerId = null,
  viewerTeamIds = [],
}: {
  matches: BracketMatch[];
  viewerId?: string | null;
  viewerTeamIds?: string[];
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Held as an id, not the match object itself, so the open panel tracks
  // the live match — re-rendering with fresh state/scores after a report,
  // confirm, or dispute — instead of freezing on the snapshot that was
  // active when it was clicked open.
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = matches.find((match) => match.id === activeId) ?? null;
  const drag = useRef<{ x: number; y: number } | null>(null);

  const { points, width, height } = useMemo(() => layout(matches), [matches]);

  // A freshly created tournament has no matches until the organizer
  // generates a bracket — layout() above still runs (hooks can't be
  // conditional), but its width/height would otherwise be
  // Math.max(...[]) + CARD_W + 40 = -Infinity: an empty Map has no points
  // to take a max of, so a real (if degenerate) number came out negative
  // infinite, not NaN — the exact kind of thing seeded data, which never
  // has zero matches, would never have exposed.
  if (matches.length === 0) {
    return (
      <div className="border border-dashed border-line bg-ink px-6 py-16 text-center">
        <p className="text-sm text-muted">No bracket yet.</p>
        <p className="mt-1 text-[0.75rem] text-faint">
          The organizer generates one once at least 2 teams are approved.
        </p>
      </div>
    );
  }

  const connectors = matches
    .filter((match) => match.winnerNextId && points.has(match.winnerNextId))
    .map((match) => {
      const from = points.get(match.id)!;
      const to = points.get(match.winnerNextId!)!;
      const x1 = from.x + CARD_W;
      const y1 = from.y + CARD_H / 2;
      const x2 = to.x;
      const y2 = to.y + CARD_H / 2;
      const mid = x1 + (x2 - x1) / 2;
      return {
        key: match.id,
        d: `M${x1} ${y1} H${mid} V${y2} H${x2}`,
        lit: active?.id === match.id || active?.id === match.winnerNextId,
      };
    });

  return (
    <div className="relative border border-line bg-ink">
      <div
        className="relative h-[520px] touch-none overflow-hidden"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
          (event.target as Element).setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setPan({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
        role="application"
        aria-label="Tournament bracket. Drag to pan, use the buttons to zoom."
      >
        <div
          className="absolute origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <svg width={width} height={height} className="absolute left-0 top-0 pointer-events-none">
            {connectors.map((connector) => (
              <path
                key={connector.key}
                d={connector.d}
                fill="none"
                strokeWidth={connector.lit ? 2 : 1}
                stroke={connector.lit ? "var(--color-signal)" : "var(--color-line-strong)"}
              />
            ))}
          </svg>

          {matches.map((match) => {
            const point = points.get(match.id)!;
            const live = match.state === "LIVE";
            const done = match.state === "COMPLETED";
            const homeWon = done && match.homeScore > match.awayScore;
            return (
              <button
                key={match.id}
                onClick={() => setActiveId(match.id)}
                className={`chamfer-sm absolute border bg-surface text-left transition-colors ${
                  live ? "border-live" : active?.id === match.id ? "border-signal" : "border-line"
                }`}
                style={{ left: point.x, top: point.y, width: CARD_W, height: CARD_H }}
              >
                {[
                  { team: match.home, score: match.homeScore, won: done && homeWon },
                  { team: match.away, score: match.awayScore, won: done && !homeWon },
                ].map((row, index) => (
                  <span
                    key={index}
                    className={`flex h-1/2 items-center gap-2 px-2 ${
                      index === 0 ? "border-b border-line/70" : ""
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 ${
                        done ? (row.won ? "bg-signal" : "bg-line-strong") : "bg-line"
                      }`}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-[0.75rem] ${
                        row.team ? (row.won || !done ? "text-text" : "text-faint") : "text-faint"
                      }`}
                    >
                      {row.team?.name ?? "—"}
                    </span>
                    <span className="tabular text-[0.75rem] text-muted">
                      {row.team ? row.score : ""}
                    </span>
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass absolute right-3 top-3 flex items-center gap-1 px-1 py-1">
        <button
          className="btn btn-ghost px-1.5"
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
          aria-label="Zoom out"
        >
          <Minus size={14} />
        </button>
        <span className="tabular w-10 text-center text-[0.6875rem] text-muted">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="btn btn-ghost px-1.5"
          onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
          aria-label="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button
          className="btn btn-ghost px-1.5"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Reset view"
        >
          <Crosshair size={14} />
        </button>
      </div>

      {active && (
        <aside className="glass-strong absolute inset-y-3 right-3 w-[280px] overflow-y-auto p-4">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="eyebrow">
                {active.side.replace("_", " ").toLowerCase()} · round {active.round}
              </p>
              <p className="display text-sm uppercase tracking-[0.05em]">{active.state.toLowerCase()}</p>
            </div>
            <button className="btn btn-ghost px-1.5" onClick={() => setActiveId(null)} aria-label="Close">
              ✕
            </button>
          </div>

          {[
            { team: active.home, score: active.homeScore },
            { team: active.away, score: active.awayScore },
          ].map((row, index) =>
            row.team ? (
              <div key={index} className="mb-2 flex items-center gap-2.5 border border-line bg-surface p-2">
                <Emblem seed={row.team.slug} tag={row.team.tag} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm">{row.team.name}</span>
                <span className="tabular display text-base">{row.score}</span>
              </div>
            ) : (
              <div key={index} className="mb-2 border border-dashed border-line p-2 text-sm text-faint">
                Waiting on an earlier match
              </div>
            ),
          )}

          {active.scheduledAt && (
            <p className="tabular mt-3 text-[0.75rem] text-muted">
              {new Date(active.scheduledAt).toLocaleString()}
            </p>
          )}
          {active.state === "LIVE" && (
            <button className="btn btn-primary mt-4 w-full">Watch this match</button>
          )}

          <MatchResultActions
            matchId={active.id}
            state={active.state}
            bestOf={active.bestOf}
            homeTeamId={active.home?.id ?? null}
            awayTeamId={active.away?.id ?? null}
            homeTeamName={active.home?.name ?? null}
            awayTeamName={active.away?.name ?? null}
            reportedById={active.resultReportedById}
            viewerId={viewerId}
            viewerTeamIds={viewerTeamIds}
          />
        </aside>
      )}
    </div>
  );
}
