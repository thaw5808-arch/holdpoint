/**
 * The community channel kinds a moderator can pick when creating a
 * channel — shared between the channel-management UI (renders these as
 * <select> options) and createCommunityChannelAction (validates against
 * the same list server-side, since a client calling the action directly
 * could send anything otherwise). Kept as the literal ChannelKind values
 * from schema.prisma rather than a redeclaration so it can't drift.
 */
export const CHANNEL_KINDS = ["TEXT", "ANNOUNCEMENT", "VOICE", "CLIPS", "EVENTS"] as const;
export type ChannelKindValue = (typeof CHANNEL_KINDS)[number];

export const CHANNEL_KIND_LABELS: Record<ChannelKindValue, string> = {
  TEXT: "Text",
  ANNOUNCEMENT: "Announcement",
  VOICE: "Voice",
  CLIPS: "Clips",
  EVENTS: "Events",
};
