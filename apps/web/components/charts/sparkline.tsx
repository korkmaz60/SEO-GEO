interface SparklineProps {
  /** Oldest first; `null` breaks the line (e.g. not ranking that day). */
  values: (number | null)[];
  /** Lower is better (rankings): smaller values are drawn higher. */
  invert?: boolean;
  width?: number;
  height?: number;
  label: string;
}

/**
 * A word-sized trend line for table cells: no axes, a 1.5 px line in the first chart color
 * and a dot on the latest value. Screen readers get `label` instead of the drawing.
 */
export function Sparkline({
  values,
  invert = false,
  width = 72,
  height = 22,
  label,
}: SparklineProps) {
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const pad = 2.5;
  const x = (index: number) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value: number) => {
    const ratio = (value - min) / span;
    return pad + (invert ? ratio : 1 - ratio) * (height - pad * 2);
  };

  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  const lastIndex = values.findLastIndex((value) => value !== null);
  const last = values[lastIndex];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      {segments.map((points) => (
        <polyline
          key={points}
          points={points}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {last !== null && last !== undefined && (
        <circle cx={x(lastIndex)} cy={y(last)} r={2} fill="var(--chart-1)" />
      )}
    </svg>
  );
}
