import { hash, seededColor } from "@/lib/art";

/**
 * Generated team emblem. Four shield silhouettes, a two-tone fill and a
 * cut glyph derived from the team tag — no borrowed esports logos.
 */
export function Emblem({ seed, tag, size = 44 }: { seed: string; tag: string; size?: number }) {
  const h = hash(seed);
  const shape = h % 4;
  const primary = seededColor(seed, 0, 56);
  const secondary = seededColor(seed, 2, 22);

  const paths = [
    "M32 3 59 15v22c0 14-13 20-27 24C18 57 5 51 5 37V15Z",
    "M32 2 60 18v28L32 62 4 46V18Z",
    "M6 6h52v34L32 60 6 40Z",
    "M32 4 58 20v24L32 60 6 44V20Z",
  ];

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d={paths[shape]} fill={secondary} />
      <path d={paths[shape]} fill="none" stroke={primary} strokeWidth="2.5" />
      <path d={`M${32 - (h % 9)} 20 32 34 ${32 + (h % 11)} 20`} fill="none" stroke={primary} strokeWidth="3" />
      <text
        x="32"
        y="49"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        letterSpacing="1"
        fill="var(--color-text)"
        fontFamily="var(--font-display)"
      >
        {tag.slice(0, 4).toUpperCase()}
      </text>
    </svg>
  );
}
