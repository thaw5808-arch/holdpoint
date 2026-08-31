import { Calendar, Film, Hash, Megaphone, Volume2 } from "lucide-react";
import type { ChannelKindValue } from "./channel-kinds";

/**
 * One icon per channel kind — shared by the sidebar's channel rows
 * (community-channel-nav.tsx) and the channel header above the main panel
 * ([slug]/page.tsx), so a channel's icon can't drift between the two.
 * Kept separate from channel-kinds.ts (plain validation data, imported by
 * the "use server" actions/community.ts) rather than folded into it,
 * since there's no reason for a server action file to pull in lucide-react
 * just because a sibling constant lives in the same module.
 */
export const CHANNEL_KIND_ICON: Record<ChannelKindValue, typeof Hash> = {
  TEXT: Hash,
  ANNOUNCEMENT: Megaphone,
  VOICE: Volume2,
  CLIPS: Film,
  EVENTS: Calendar,
};
