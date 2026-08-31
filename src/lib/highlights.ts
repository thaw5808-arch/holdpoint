/**
 * Automatic highlight detection (spec §8).
 *
 * Runs over a stream's per-second telemetry and returns candidate clip
 * windows ranked by heat. Signals are weighted separately so the studio
 * can tell the creator WHY a moment was flagged instead of presenting
 * an unexplained list.
 */

export interface TelemetrySecond {
  second: number;
  chatMessages: number;
  viewers: number;
  gameEvent?: "MATCH_WON" | "KILL_STREAK" | "CLUTCH" | "MARKER";
}

export interface HighlightCandidate {
  startSec: number;
  endSec: number;
  heat: number;
  source: "AUTO_CHAT_SPIKE" | "AUTO_GAME_EVENT" | "AUTO_VIEWER_SPIKE" | "AUTO_MARKER";
  reason: string;
}

const CLIP_LEAD_IN = 22;
const CLIP_LEAD_OUT = 8;

export function detectHighlights(
  telemetry: TelemetrySecond[],
  { minHeat = 40, maxCandidates = 8 } = {},
): HighlightCandidate[] {
  if (telemetry.length < 30) return [];

  const chatAvg =
    telemetry.reduce((sum, t) => sum + t.chatMessages, 0) / telemetry.length || 1;
  const candidates: HighlightCandidate[] = [];

  for (const tick of telemetry) {
    const chatRatio = tick.chatMessages / chatAvg;
    const window = telemetry.filter(
      (t) => t.second >= tick.second - 60 && t.second < tick.second,
    );
    const viewersBefore = window.length
      ? window.reduce((sum, t) => sum + t.viewers, 0) / window.length
      : tick.viewers;
    const viewerRatio = tick.viewers / Math.max(1, viewersBefore);

    let heat = 0;
    let source: HighlightCandidate["source"] = "AUTO_CHAT_SPIKE";
    let reason = "";

    if (tick.gameEvent === "MARKER") {
      heat = 100;
      source = "AUTO_MARKER";
      reason = "Stream marker";
    } else if (tick.gameEvent) {
      heat = 72 + Math.round(Math.min(28, (chatRatio - 1) * 20));
      source = "AUTO_GAME_EVENT";
      reason = tick.gameEvent.toLowerCase().replace("_", " ");
    } else if (chatRatio >= 2.5) {
      heat = Math.round(Math.min(95, chatRatio * 22));
      source = "AUTO_CHAT_SPIKE";
      reason = `Chat ${chatRatio.toFixed(1)}x normal`;
    } else if (viewerRatio >= 1.15) {
      heat = Math.round(Math.min(80, (viewerRatio - 1) * 200));
      source = "AUTO_VIEWER_SPIKE";
      reason = `Viewers up ${Math.round((viewerRatio - 1) * 100)}%`;
    }

    if (heat >= minHeat) {
      candidates.push({
        startSec: Math.max(0, tick.second - CLIP_LEAD_IN),
        endSec: tick.second + CLIP_LEAD_OUT,
        heat,
        source,
        reason,
      });
    }
  }

  // Collapse overlapping windows, keeping the hottest.
  const merged: HighlightCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.heat - a.heat)) {
    if (merged.some((m) => candidate.startSec < m.endSec && candidate.endSec > m.startSec)) {
      continue;
    }
    merged.push(candidate);
    if (merged.length >= maxCandidates) break;
  }
  return merged.sort((a, b) => a.startSec - b.startSec);
}
