# Data Model and Metric Semantics

## 1. Entities

### `episodes`
- `id` (UUID/ULID or integer primary key; choose consistently)
- `episode_code` (nullable, unique when present)
- `title` (required)
- `premise` / `summary` (nullable text)
- `format` (nullable; e.g. short story, explainer)
- `duration_seconds` (nullable integer)
- `script_text` (nullable text)
- `created_at`, `updated_at`
- `published_at` is not canonical here if distribution dates differ by platform.

### `platforms`
Seed supported platforms: `facebook`, `youtube`, `tiktok`. Store stable internal keys and human-readable names separately.

### `distributions`
- `id`, `episode_id`, `platform_id`
- `post_url` (nullable)
- `published_at` (nullable timestamp with timezone normalization)
- `external_post_id` (nullable)
- `variant_label` (nullable; supports reposts/variants)
- `status` (draft, published, archived, unknown)
- `created_at`, `updated_at`

### `metric_definitions`
- `id`, `platform_id` (nullable for shared metrics)
- `key`, `label`, `unit`, `description`
- `aggregation_kind` (counter, ratio, duration, currency, categorical)
- `source_definition` (nullable)
- `formula_version` (nullable)
- `is_active`

Examples: views, reach, likes, comments, shares, saves, followers gained, watch time, average view duration, impressions, click-through rate. Only expose metrics where a manual definition is documented; avoid assuming every platform offers every metric.

### `metric_snapshots`
- `id`, `distribution_id`, `captured_at`
- `post_age_seconds` (nullable; derive if possible, persist only if needed for immutable capture context)
- `source` (`manual`, `csv_import`, `api` only if future supported)
- `note` (nullable)
- `created_at`

### `metric_values`
- `snapshot_id`, `metric_definition_id`
- `numeric_value` nullable
- `text_value` nullable
- `value_state` (`known`, `unknown`, `not_available`, `not_applicable`)
- Unique constraint on `(snapshot_id, metric_definition_id)`
- Validate that the correct value column is used for the metric type.

Use either normalized `metric_values` or a JSON payload only after documenting query and validation trade-offs. The normalized design is preferred for configurable platform metrics and reliable queries.

### `tags` and `episode_tags`
- Reusable labels for themes, format, hook, tone, topic, CTA, or series.
- Tag assignment must not be used as causal evidence without experiment design.

### `experiments`
- `id`, `title`, `hypothesis`, `rationale`, `variable_to_test`
- `primary_metric_definition_id`, `comparison_window_hours`
- `success_threshold` (typed/structured, not ambiguous prose only)
- `status` (`draft`, `planned`, `running`, `completed`, `inconclusive`, `cancelled`)
- `started_at`, `ended_at`, `decision`, `learning`, `created_at`, `updated_at`

### `experiment_distributions`
Links experiment to distributions and labels role (`baseline`, `variant`, `supporting`).

### `import_jobs`
- `id`, `file_name` (sanitized), `started_at`, `completed_at`
- `status`, `rows_total`, `rows_valid`, `rows_rejected`
- `error_summary` without raw secrets or full file contents

### `app_settings`
- Key/value for non-secret preferences only: timezone, theme, comparison windows, onboarding state.
- Never store provider access/refresh tokens here.

## 2. Data integrity rules

- Missing metric = `NULL`/`unknown`, not numeric zero.
- Zero is a valid measured value.
- A snapshot is immutable historical evidence. Corrections should be explicit edits with audit context or a replacement snapshot, not silent loss of prior values.
- Normalize timestamps to UTC in storage; render in the user-selected timezone.
- Preserve original imported timestamp/value and import provenance when practical.
- Validate non-negative counters unless a documented metric can be negative.
- Ratio units must be explicit: `0.15` vs `15` percent must never be ambiguous.
- Currency includes currency code.
- Do not calculate percentage change if the baseline is unknown or zero; show N/A with explanation.

## 3. Equivalent-age analytics

- `post_age = captured_at - published_at` when both timestamps exist.
- For target windows such as 24h or 7d, define a tolerance window (initial suggestion: ±6 hours for 24h; ±24 hours for 7d, configurable).
- Show actual post age next to each value.
- If multiple snapshots fit, choose the closest to target or show a selection rule; never silently pick arbitrary data.
- Keep platform rows separate by default.
- Only aggregate same metric definitions with matching units and equivalent observation windows.

## 4. Suggested indexes

- `distributions(episode_id, platform_id)`
- `distributions(platform_id, published_at)`
- `metric_snapshots(distribution_id, captured_at)`
- `metric_values(metric_definition_id, snapshot_id)`
- `episode_tags(tag_id, episode_id)`
- `experiment_distributions(experiment_id, distribution_id)`

Revisit indexes based on actual query plans and data size.

## 5. Implementation notes (as built in M1–M3, schema v3)

Source of truth: `src/lib/db/migrations/`. Differences and decisions on top of the sections above:

- **IDs and time.** Entity IDs are random UUIDs (TEXT). Timestamps are UTC ISO-8601 strings. `platforms.id` is the stable key (`facebook`, `youtube`, `tiktok`); `platforms.name` is the label.
- **Settings.** `app_settings` keys in use: `timezone` (IANA, default `Asia/Jakarta`) and `comparison_windows` (JSON `[{hours, toleranceHours}]`, default 24h±6h and 168h±24h, max 4). Corrupt stored values fall back to defaults.
- **Distributions.** Unique on `(episode_id, platform_id, lower(COALESCE(variant_label,'')))`: one post per platform unless a distinct variant label is given. The platform cannot change once the distribution has snapshots. `published_at` NULL means unknown.
- **Metric definitions.** Added `currency_code` (required iff `aggregation_kind='currency'`) and `allow_negative`. `key`, platform scope, kind, unit, currency and sign rule are immutable after creation (so stored values keep their meaning); label, description, `source_definition`, `formula_version` and `is_active` are editable. A key is unique across shared + platform scopes. Seeded definitions intentionally have **no** `source_definition` — it must be recorded by the user; the UI flags it.
- **Ratios** are stored as fractions (0–1) and entered/displayed as percentages.
- **Snapshots.** Append-only: `BEFORE UPDATE` triggers abort on `metric_snapshots` and `metric_values`; the repository exposes no update/delete. Rows disappear only through an explicit, confirmed delete of the distribution or episode (FK cascade). `post_age_seconds` is persisted at capture time and is **not** recomputed if `published_at` is edited later. Corrections are new snapshots with `supersedes_snapshot_id`; a snapshot can be superseded once. Analytics (M4) must exclude superseded snapshots from comparisons.
- **Values.** A blank input stores **no row**. Absence of a row and `value_state='unknown'` both mean unknown and must be treated identically by readers. The UI writes rows only for `known`, `not_available` and `not_applicable`. DB CHECK: `known` has exactly one of `numeric_value`/`text_value`; all other states have both NULL. A measured `0` is `known` with `numeric_value = 0`.
- **Input rules.** Counters: integers, no thousands separators. Durations/currency: decimal (comma or dot). Non-negative unless `allow_negative`. Magnitude ≤ 1e15.
- **Snapshot validation.** Blocking: invalid/nonexistent local time, future time, capture earlier than `published_at`, unparsable values, no metric given. Warnings (need explicit confirmation): unknown `published_at`, duplicate capture time, counter/duration lower than the previous (or higher than the next) known snapshot — cumulative behavior is not assumed because platform definitions vary.

## 6. Example analytics output contract

```ts
interface MetricObservation {
  platform: 'facebook' | 'youtube' | 'tiktok';
  metricKey: string;
  value: number | null;
  unit: string;
  capturedAt: string | null;
  postAgeHours: number | null;
  completeness: 'known' | 'unknown' | 'not_available' | 'not_applicable';
}
```

The analytics layer should carry enough metadata to explain why values can or cannot be compared.
