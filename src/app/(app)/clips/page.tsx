import { redirect } from "next/navigation";
import { ClipFeed } from "@/components/clip-feed";
import { EmptyState } from "@/components/ui";
import { fetchClipFeedPage } from "@/lib/clips";
import { getCurrentUser } from "@/lib/session";

export default async function ClipsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { clips, nextCursor } = await fetchClipFeedPage({ viewerId: user.id });

  if (clips.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          title="No clips yet"
          body="Nobody's uploaded a clip yet. Be the first — upload one and the feed starts here."
          action={{ href: "/clips/new", label: "Upload a clip" }}
        />
      </div>
    );
  }

  return <ClipFeed viewerId={user.id} clips={clips} initialCursor={nextCursor} />;
}
