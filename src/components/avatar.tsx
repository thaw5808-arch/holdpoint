import { hash, initials, seededColor } from "@/lib/art";

export function Avatar({
  name,
  seed,
  size = 36,
  live = false,
  presence,
  avatarUrl,
}: {
  name: string;
  seed?: string;
  size?: number;
  live?: boolean;
  presence?: "ONLINE" | "IN_GAME" | "STREAMING" | "AWAY" | "OFFLINE";
  /** Path from avatarSrc() (or any already-servable URL). Falls back to
   * the generated gradient-and-initials art when absent. */
  avatarUrl?: string | null;
}) {
  const key = seed ?? name;
  const h = hash(key);
  const dotColor =
    presence === "STREAMING"
      ? "var(--color-live)"
      : presence === "IN_GAME"
        ? "var(--color-ice)"
        : presence === "ONLINE"
          ? "var(--color-signal)"
          : presence === "AWAY"
            ? "var(--color-gold)"
            : "var(--color-faint)";

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {avatarUrl ? (
        // Uploaded avatars are served through a redirecting app route (the
        // bucket is private), and this codebase has no next/image usage
        // elsewhere — a plain <img> avoids routing avatar loads through
        // Next's image optimizer just to follow that redirect.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="chamfer-sm h-full w-full object-cover"
          style={{ border: live ? "1.5px solid var(--color-live)" : "1px solid var(--color-line-strong)" }}
        />
      ) : (
        <span
          className="chamfer-sm flex h-full w-full items-center justify-center"
          style={{
            background: `linear-gradient(${140 + (h % 90)}deg, ${seededColor(key, 0, 30)}, ${seededColor(key, 3, 16)})`,
            border: live ? "1.5px solid var(--color-live)" : "1px solid var(--color-line-strong)",
          }}
        >
          <span
            className="display leading-none"
            style={{ fontSize: size * 0.36, color: "var(--color-text)" }}
          >
            {initials(name)}
          </span>
        </span>
      )}
      {presence && (
        <span
          aria-label={presence.toLowerCase()}
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 border border-canvas"
          style={{ background: dotColor }}
        />
      )}
    </span>
  );
}
