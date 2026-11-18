import { formatPeriod, money, type Series } from "./format.ts";

// The smallest 1, 2 or 5 times a power of ten at or above `value`, for a round top line.
const roundUp = (value: number) => {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((step) => step * power >= value) ?? 10) * power;
};

// Revenue per period as bars, drawn in SVG with no charting library. The bars stretch to the
// width; the labels are HTML so they stay readable at any width. The table beside it carries the
// same numbers for anyone who cannot see the bars.
// ponytail: bars and a single series only; draw lines or stacks the same way if a metric needs them.
export function Chart({ series, label }: { readonly series: Series; readonly label: string }) {
  const { points } = series;
  const top = roundUp(Math.max(0, ...points.map((point) => point.revenue)));
  const slot = 100 / Math.max(points.length, 1);
  const first = points.at(0);
  const last = points.at(-1);

  return (
    <figure className="dashboard-chart">
      <div className="dashboard-axis" aria-hidden="true">
        <span>{money(top)}</span>
        <span>{money(top / 2)}</span>
        <span>{money(0)}</span>
      </div>
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="dashboard-plot"
      >
        {[0, 50, 100].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} className="dashboard-grid" />
        ))}
        {points.map((point, index) => {
          const height = (point.revenue / top) * 100;
          return (
            <rect
              key={point.period}
              x={index * slot + slot * 0.1}
              y={100 - height}
              width={slot * 0.8}
              height={height}
              className="dashboard-bar"
            >
              <title>{`${formatPeriod(point.period)}: ${money(point.revenue)}`}</title>
            </rect>
          );
        })}
      </svg>
      {first && last && (
        <figcaption className="dashboard-periods" aria-hidden="true">
          <span>{formatPeriod(first.period)}</span>
          {last !== first && <span>{formatPeriod(last.period)}</span>}
        </figcaption>
      )}
    </figure>
  );
}
