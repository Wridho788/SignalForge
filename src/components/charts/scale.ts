/** Rounds a span to a "clean" step (1, 2, 5 × 10^k) and returns ticks covering [min, max]. */
export function niceTicks(min: number, max: number, target = 4): { ticks: number[]; min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 };
  if (max === min) {
    const pad = Math.abs(max) > 0 ? Math.abs(max) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = ([1, 2, 2.5, 5, 10].find((s) => norm <= s + 1e-9) ?? 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { ticks, min: lo, max: hi };
}

/** Compact axis labels from 1,000 up: 0 / 1K / 2.5K / 1.2M (Indonesian decimal comma). */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number, suffix: string) => `${Number(v.toFixed(1)).toString().replace('.', ',')}${suffix}`;
  if (abs >= 1e9) return fmt(n / 1e9, 'M'.replace('M', 'B'));
  if (abs >= 1e6) return fmt(n / 1e6, 'M');
  if (abs >= 1e3) return fmt(n / 1e3, 'K');
  return Number(n.toFixed(2)).toString().replace('.', ',');
}

export function linear(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  const span = domainMax - domainMin || 1;
  return (v: number) => rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin);
}
