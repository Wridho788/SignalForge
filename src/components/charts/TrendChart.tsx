import { ChartFrame } from './ChartFrame';
import { linear, niceTicks } from './scale';

export interface ChartPoint {
  x: number;
  /** null = unknown / not comparable: drawn as a gap (never interpolated, never plotted as 0). */
  y: number | null;
  /** Tooltip + aria text for the mark. */
  tip: string;
  /** Row label for the table twin (the x value as text). */
  xLabel: string;
  /** Table twin cell for y (formatted value, or the reason it is missing). */
  yText: string;
}

export interface ChartBand {
  from: number;
  to: number;
  label: string;
}

const W = 640;
const M = { l: 56, r: 20, t: 24, b: 40 };
const SURFACE = '#ffffff';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';

/**
 * Single-series line chart (SVG, server-rendered).
 * Specs follow the dataviz skill: 2px line, ≥8px markers with a 2px surface ring, hairline solid
 * grid, one y axis anchored at 0 for non-negative data, no interpolation across unknowns.
 */
export function TrendChart({
  title,
  description,
  points,
  color,
  xTicks,
  xAxisLabel,
  yAxisLabel,
  formatY,
  bands = [],
  tableXHeader,
  tableYHeader,
}: {
  title: string;
  /** What is plotted, incl. filters/window — also the accessible description. */
  description: string;
  points: ChartPoint[];
  color: string;
  xTicks: { x: number; label: string }[];
  xAxisLabel: string;
  yAxisLabel: string;
  formatY: (v: number) => string;
  bands?: ChartBand[];
  tableXHeader: string;
  tableYHeader: string;
}) {
  const known = points.filter((p) => p.y !== null) as (ChartPoint & { y: number })[];
  const id = `chart-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  const table = (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold">Tabel data grafik</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{tableXHeader}</th>
              <th scope="col" className="num">
                {tableYHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <th scope="row" className="!bg-transparent font-normal">
                  {p.xLabel}
                </th>
                <td className="num">{p.yText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );

  if (points.length === 0 || known.length === 0) {
    return (
      <figure className="card">
        <figcaption className="mb-2">
          <span className="block font-semibold">{title}</span>
          <span className="text-sm text-muted">{description}</span>
        </figcaption>
        <p className="rounded-control border border-dashed border-line p-6 text-center text-sm text-muted">
          {points.length === 0
            ? 'Belum ada titik data untuk digambar.'
            : 'Belum ada nilai yang diketahui pada titik mana pun — tidak ada garis yang digambar (nilai tidak diketahui tidak dianggap 0).'}
        </p>
        {points.length > 0 ? table : null}
      </figure>
    );
  }

  const H = known.length < 2 ? 200 : 260; // a single point does not need a tall plot
  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs, ...xTicks.map((t) => t.x));
  const xMax = Math.max(...xs, ...xTicks.map((t) => t.x));
  const yVals = known.map((p) => p.y);
  const dataMin = Math.min(...yVals);
  const yDomain = niceTicks(Math.min(0, dataMin), Math.max(...yVals, dataMin < 0 ? 0 : 1e-9), 4);
  const sx = linear(xMin, xMax, M.l, W - M.r);
  const sy = linear(yDomain.min, yDomain.max, H - M.b, M.t);
  const baseY = sy(Math.max(0, yDomain.min));
  const lastKnown = known[known.length - 1]!;

  // Break the line wherever the series has a gap.
  const segments: (ChartPoint & { y: number })[][] = [];
  let current: (ChartPoint & { y: number })[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(p as ChartPoint & { y: number });
    }
  }
  if (current.length) segments.push(current);

  return (
    <figure className="card">
      <figcaption className="mb-2">
        <span id={`${id}-t`} className="block font-semibold">
          {title}
        </span>
        <span id={`${id}-d`} className="text-sm text-muted">
          {description}
        </span>
      </figcaption>
      <ChartFrame>
        {/* Scrollable, keyboard-focusable region: on narrow screens the plot keeps a readable minimum width. */}
        <div role="region" aria-label={`Grafik: ${title}`} tabIndex={0} className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} className="h-auto w-full min-w-[560px]">
          {bands.map((b) => (
            <g key={`${b.from}-${b.to}`}>
              <rect x={sx(b.from)} y={M.t} width={Math.max(2, sx(b.to) - sx(b.from))} height={H - M.b - M.t} fill={color} opacity={0.1} />
              <text x={sx(b.from) + 4} y={M.t + 11} fontSize="11" style={{ fill: 'var(--color-muted)' }}>
                {b.label}
              </text>
            </g>
          ))}
          {yDomain.ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={M.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--color-muted)' }}>
                {formatY(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.x} x={sx(t.x)} y={H - M.b + 16} textAnchor="middle" fontSize="11" style={{ fill: 'var(--color-muted)' }}>
              {t.label}
            </text>
          ))}
          <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize="11" style={{ fill: 'var(--color-muted)' }}>
            {xAxisLabel}
          </text>
          <text transform={`translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" style={{ fill: 'var(--color-muted)' }}>
            {yAxisLabel}
          </text>

          {segments.map((seg, i) =>
            seg.length > 1 ? (
              <path
                key={i}
                d={seg.map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}

          {points.map((p, i) =>
            p.y === null ? (
              // Unknown: hollow marker on the baseline (a different shape, not just a different color).
              <g key={i} className="chart-point" tabIndex={0} role="img" aria-label={p.tip} data-tip={p.tip}>
                <circle className="chart-ring" cx={sx(p.x)} cy={baseY} r={13} />
                <circle cx={sx(p.x)} cy={baseY} r={4} fill={SURFACE} stroke={color} strokeWidth={2} />
              </g>
            ) : (
              <g key={i} className="chart-point" tabIndex={0} role="img" aria-label={p.tip} data-tip={p.tip}>
                <circle className="chart-ring" cx={sx(p.x)} cy={sy(p.y)} r={13} />
                <circle cx={sx(p.x)} cy={sy(p.y)} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />
              </g>
            ),
          )}

          {/* One selective direct label: the most recent known value. */}
          <text
            x={Math.min(sx(lastKnown.x), W - M.r - 2)}
            y={sy(lastKnown.y) - 12 < M.t + 6 ? sy(lastKnown.y) + 20 : sy(lastKnown.y) - 12}
            textAnchor={sx(lastKnown.x) > W - 80 ? 'end' : 'middle'}
            fontSize="12"
            fontWeight="600"
            style={{ fill: 'var(--color-ink)' }}
          >
            {formatY(lastKnown.y)}
          </text>
        </svg>
        </div>
      </ChartFrame>
      <p className="text-xs text-muted">
        Marker berongga di dasar = nilai tidak diketahui atau tidak tersedia (garis diputus, tidak diinterpolasi).
      </p>
      {table}
    </figure>
  );
}
