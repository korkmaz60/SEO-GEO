import { cn } from "@/lib/utils";

interface ScoreRingProps {
  /** 0–100, or `null` when there is no data yet. */
  score: number | null;
  label: string;
  size?: number;
  strokeWidth?: number;
  /** CSS color for the progress arc, e.g. `var(--geo)`. */
  color?: string;
  className?: string;
}

/** A single score as a ring. Shows an empty track and "—" when there is no data. */
export function ScoreRing({
  score,
  label,
  size = 112,
  strokeWidth = 8,
  color = "var(--primary)",
  className,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = score === null ? 0 : Math.min(100, Math.max(0, score));
  const offset = circumference * (1 - clamped / 100);

  return (
    <figure className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-muted"
          />
          {score !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-500"
            />
          )}
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-2xl font-semibold",
            score === null && "text-muted-foreground/60",
          )}
        >
          {score === null ? "—" : Math.round(clamped)}
        </span>
      </div>
      <figcaption className="text-sm text-muted-foreground">{label}</figcaption>
    </figure>
  );
}
