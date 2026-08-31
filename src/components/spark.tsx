/** Small area chart. Plain SVG — no chart library for four data points. */
export function Spark({
  points,
  labels,
  height = 96,
}: {
  points: number[];
  labels?: string[];
  height?: number;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const step = 100 / Math.max(1, points.length - 1);
  const line = points.map((value, index) => `${index * step},${100 - (value / max) * 92}`);

  return (
    <figure>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full">
        <polygon
          points={`0,100 ${line.join(" ")} 100,100`}
          fill="var(--color-signal)"
          opacity="0.12"
        />
        <polyline
          points={line.join(" ")}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {labels && (
        <figcaption className="tabular mt-1 flex justify-between text-[0.625rem] text-faint">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
