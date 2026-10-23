import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Reads the real tokens from globals.css so the WCAG AA claim in DESIGN_SYSTEM.md stays true.
const css = fs.readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token ${name} not found`);
  return m[1]!;
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('design token contrast (WCAG AA: 4.5:1 for text)', () => {
  const pairs: [string, string, string][] = [
    ['ink', 'canvas', 'body text on canvas'],
    ['ink', 'surface', 'body text on surface'],
    ['muted', 'surface', 'muted text on surface'],
    ['muted', 'canvas', 'muted text on canvas'],
    ['surface', 'primary', 'primary button text'],
    ['surface', 'primary-strong', 'primary button hover text'],
    ['surface', 'danger', 'danger button text'],
    ['primary', 'surface', 'link/accent text on surface'],
    ['primary', 'primary-soft', 'selected nav text'],
    ['success', 'success-soft', 'success text'],
    ['warning', 'warning-soft', 'warning text'],
    ['danger', 'danger-soft', 'danger text'],
    ['danger', 'surface', 'error text on surface'],
  ];
  it.each(pairs)('%s on %s ≥ 4.5 (%s)', (fg, bg) => {
    expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('input border meets 3:1 non-text contrast against surface', () => {
    expect(ratio('#8a93a3', token('surface'))).toBeGreaterThanOrEqual(3);
  });
});
