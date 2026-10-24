# ADR 0006: Equivalent-age selection rule and observational experiment evidence

- Status: Accepted
- Date: 2026-10-24

## Context
ADR 0003 requires comparing posts at equivalent ages and never inventing values. M4 (analytics) and M5 (experiments) need exact, testable rules, and the PRD forbids causal claims from simple before/after comparisons.

## Decision
**Equivalent-age value (M4).** For a distribution, metric and window (target hours ± tolerance hours, from Settings):
1. Use only non-superseded snapshots that have a post age ≥ 0.
2. Keep readings inside `|age − target| ≤ tolerance`; of those, only `known` numeric values are candidates.
3. Pick the candidate closest to the target; ties go to the earlier capture.
4. Otherwise return an explicit reason: `no_snapshots`, `no_post_age`, `no_snapshot_in_window` (with the nearest age), `value_unknown`, `not_available`, `not_applicable`. A snapshot outside the window is never substituted, and unknown is never 0.
5. Aggregation is per platform and per metric definition only (median, min, max, n). Nothing sums or averages across platforms. Rankings need n ≥ 3 and carry a small-sample warning below 5.
6. Change between two readings: absolute when both are known; relative only when the baseline is known and > 0.

**Experiments (M5).** The definition (hypothesis, variable, metric, window, structured success threshold) is editable only in Draft/Planned and locked once Running, so thresholds cannot be moved after seeing data. The window tolerance is copied from Settings at creation. Success is `min_value` or `min_relative_gain`. Evidence is computed on read from snapshots, per platform, from linked baseline vs variant posts (supporting links are context only), using the same equivalent-age rule. It yields an *indication* (`meets` / `does_not_meet` / `insufficient`) with limitations that always include "observational, no randomization, not causal"; a before/after design adds that it cannot separate the variable's effect from other factors; small samples and "concurrent" designs whose posts are far apart in time are flagged. `inconclusive` is a first-class outcome. The decision log is append-only.

## Consequences
Fewer comparisons are shown, but each is traceable to a snapshot, an age and a reason. The app deliberately cannot say a variable "caused" a result. Users who want causal claims need a controlled design outside this tool.

## Revisit when
Platform APIs or CSV import provide denser snapshots (a different tolerance default may be warranted), or a randomized-experiment workflow is added.
