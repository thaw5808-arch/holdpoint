"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "clip-sound-muted";

// Module-scoped rather than per-component state: the feed keeps every
// clip's <ClipStage> mounted at once (only the active one actually plays —
// see ClipFeed's items.map), so a per-instance default would leave each
// clip re-deciding "muted" on its own instead of sharing one preference.
// Seeded from sessionStorage so the choice also survives a reload within
// the same tab (closing the tab clears it) — the "session" scope the mute
// toggle is meant to have, the same way TikTok remembers "I turned sound
// on" rather than resetting to muted on every new clip or page load.
let muted = true;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored !== null) muted = stored === "true";
  } catch {
    // Storage can throw (private browsing, disabled storage) — fall back
    // to the in-memory default, which still shares across clips for the
    // life of this tab even without persistence across a reload.
  }
}

function getSnapshot() {
  hydrate();
  return muted;
}

// sessionStorage doesn't exist during SSR, so this has to return a fixed
// value matching what the client sees pre-hydration or React flags a
// hydration mismatch. useSyncExternalStore re-syncs to the real,
// possibly-different value in a client-only pass right after mount — same
// pattern any browser-storage-backed store needs.
function getServerSnapshot() {
  return true;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

/** Sets the shared mute preference and persists it — called by
 * ClipMuteButton, and by any <video>'s onVolumeChange so a native
 * controls' own mute/volume UI (the lightbox's scrubber, or a
 * reduced-motion clip's native controls) stays in sync with the shared
 * flag instead of drifting from it. */
export function setClipMuted(next: boolean) {
  hydrate();
  if (muted === next) return;
  muted = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Best-effort persistence, as above — the in-session share still
    // works via the module-level variable and listeners regardless.
  }
  for (const listener of listeners) listener();
}

/** Whether clip playback should be muted, shared by every clip currently
 * on screen and remembered for the rest of the browser session. */
export function useClipMuted() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
