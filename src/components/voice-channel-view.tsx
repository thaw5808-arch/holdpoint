import { Mic, Users } from "lucide-react";

/**
 * What a VOICE-kind channel shows in the main panel instead of the text
 * composer + post list — there's nothing to post there (createCommunityPostAction
 * rejects it server-side too, see actions/community.ts). No participant
 * list is wired up: a VOICE CommunityChannel has no relation to
 * VoiceParticipant (that model belongs to the separate, seed-only
 * VoiceRoom concept — see the Voice section in [slug]/page.tsx), so
 * "who's in it" is honestly always empty until real presence exists.
 */
export function VoiceChannelView({ channelName }: { channelName: string }) {
  return (
    <div className="border border-line bg-surface px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-line-strong bg-raised">
        <Mic size={22} className="text-signal" />
      </div>
      <h3 className="display text-base uppercase tracking-[0.05em]">#{channelName}</h3>
      <p className="mt-1 text-sm text-muted">Voice channel</p>

      <div className="mx-auto mt-5 max-w-xs border border-dashed border-line px-4 py-3 text-left">
        <p className="eyebrow mb-1.5 flex items-center gap-1.5">
          <Users size={12} /> In this channel
        </p>
        <p className="text-sm text-faint">Nobody&rsquo;s here yet.</p>
      </div>

      <button
        type="button"
        className="btn btn-primary mt-5 disabled:cursor-not-allowed disabled:opacity-40"
        disabled
        title="Voice isn't live yet"
      >
        <Mic size={14} /> Join Voice
      </button>
      <p className="mt-2 text-[0.75rem] text-faint">Coming soon — real-time voice isn&rsquo;t built yet.</p>
    </div>
  );
}
