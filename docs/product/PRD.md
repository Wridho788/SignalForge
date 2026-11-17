# Product Requirements Document

## 1. Product summary

SignalForge — Content Intelligence ("Turn content signals into smarter decisions") is a local-first workspace for manually tracking the performance of short-form content published to Facebook Pro/Reels, YouTube Shorts, and TikTok. It turns scattered post metrics into comparable snapshots, useful observations, and testable content experiments.

### Product principle: analysis cycle

| Stage | Meaning in SignalForge | Primary flow |
|---|---|---|
| 01 Measure | Record manual snapshots per platform; unknown stays `NULL`. | Flow A, B, E |
| 02 Understand | Compare at equivalent post ages with platform, metric definition, snapshot age, and provenance. | Flow C |
| 03 Experiment | Turn observations into a hypothesis with a measurable success criterion. | Flow D |
| 04 Improve | Record the decision and learning that shape the next episode. | Flow D |

## 2. Problem

Creators often have fragmented platform analytics, incomplete historical records, different metric definitions, and no disciplined process for turning results into the next experiment. A dashboard that simply sums views across platforms can mislead users; the product must explain context and uncertainty.

## 3. Goals

- Record episodes and each platform-specific distribution.
- Capture manual metrics over time, including partial/incomplete history.
- Show platform-specific performance and changes between snapshots.
- Compare posts at equivalent ages when data supports it (e.g. 24h or 7d).
- Identify top/bottom performers without claiming causality.
- Track hypotheses, experiments, and outcomes.
- Offer optional AI-assisted analysis through a local provider connection.
- Work offline for core CRUD and analytics after dependencies are installed; no mandatory cloud backend.
- Make import/export and backup understandable and safe.

## 4. Non-goals for MVP

- Scraping or automatically logging into social platforms.
- Publishing/scheduling posts.
- Automatic collection of platform analytics APIs.
- Public multi-tenant SaaS deployment.
- Guaranteed virality, view counts, monetization, or causal explanations.
- Sending all local data to AI by default.
- Storing raw provider OAuth tokens in the app database.

## 5. Primary user and jobs to be done

Primary user: an individual creator managing a small content channel across multiple platforms.

Jobs:
1. “I want to enter the metrics I have without pretending missing history is zero.”
2. “I want to see which content and platform are performing better at comparable time points.”
3. “I want to understand what evidence supports an insight.”
4. “I want to plan one measurable experiment for the next episode.”
5. “I want AI assistance without losing control over my data or authentication.”

## 6. Core user flows

### Flow A — Initial setup
1. Launch the app locally.
2. See a clear empty state with an action to create the first episode or import CSV.
3. Set timezone and preferred comparison windows.
4. Optionally visit AI Connections to set up Claude, Codex, or Gemini; skipping AI must not block usage.

### Flow B — Record a post
1. Create/edit episode metadata.
2. Add one distribution per platform where it was published.
3. Enter a snapshot timestamp and only the metrics known at that point.
4. Review validation warnings and save.
5. Later add another snapshot; never overwrite historical snapshots silently.

### Flow C — Analyze
1. Select date range, platform(s), and comparison age.
2. Review KPI summary, trend, platform comparison, and content table.
3. Open an episode to inspect timeline and metric provenance.
4. Optional: ask a connected AI provider to analyze a bounded summary of selected records.
5. Review evidence, caveats, hypotheses, and suggested experiment.

### Flow D — Experiment
1. Create a hypothesis and define the variable being tested.
2. Define primary metric, comparison window, and success threshold.
3. Link relevant episodes/distributions.
4. Record outcome and decision (keep, iterate, reject, inconclusive).

### Flow E — Import/export and backup
1. Download a CSV template.
2. Import a file into a preview stage.
3. Show row-level validation errors and duplicates before commit.
4. Export selected data or full backup; provide restore instructions.

## 7. Functional requirements

### P0 — Foundation
- Local-only app runtime and database initialization.
- App shell, navigation, responsive layout, error/empty/loading states.
- Database migrations and seed/example data clearly marked as demo.
- Settings: timezone, theme, default comparison windows.

### P0 — Content and distribution
- CRUD episodes: title, working title, episode code, premise, format, duration, script/summary, published date, tags, notes.
- CRUD distributions: platform, post URL (optional), published timestamp, content status, platform-specific identifiers if manually available.
- Prevent duplicate distribution records for same episode/platform unless explicitly allowed for reposts/variants.

### P0 — Metrics and analytics
- Append-only metric snapshots with captured_at and optional post_age_hours.
- Metric fields are platform-aware and may be nullable.
- Summary cards and trend charts with explicit date/window labels.
- Filter by platform, episode, tag, and date range.
- Comparison table that avoids summing non-equivalent metrics by default.
- Top content lists with minimum sample-size and data completeness warnings.

### P1 — Experiments
- Hypothesis, rationale, variable, target audience, primary/secondary metrics, success criteria, status, start/end dates, linked content, outcome and learning.
- Clearly label inconclusive outcomes where data is sparse or comparisons are not equivalent.

### P1 — CSV import/export and backup
- Versioned template, preview, validation, duplicate handling, error download.
- Export data and provide a database backup workflow.
- Restore should require explicit confirmation and create a pre-restore backup.

### P1 — AI Connections
- Separate settings page for Claude, Codex, and Gemini.
- Provider cards with installation/login status, connection health, last checked time, safe error details, and setup instructions.
- “Connect / Sign in” action invokes official CLI/app-server login flow or opens official setup docs; Gemini API key setup stays in a hidden terminal prompt and server environment; do not extract or display credentials.
- “Test connection” runs a minimal bounded health check.
- “How to set up” expands OS-specific instructions and official links.
- AI analysis is opt-in per action, shows which data summary will be sent, supports cancel/timeout, and reports provider errors safely.
- Dashboard CRUD/analytics remains functional if AI is disconnected.

### P2 — Quality of life
- Saved filters, notes on snapshots, configurable metric definitions, richer audit trail.
- Optional AI prompt templates and experiment summary generation.

## 8. Analytics definitions

- Snapshot: metric values captured at a specific timestamp, not a lifetime total unless provider defines it that way.
- Post age: captured_at minus published_at, computed only when both timestamps are known.
- Equivalent-age comparison: compare values captured within a configurable tolerance of the target age; show actual ages and tolerance.
- Engagement rate: do not use a universal formula across platforms. If implemented, each formula must be named, versioned, and display numerator/denominator.
- Growth: show absolute and relative change; relative change is unavailable when baseline is zero or unknown.
- Missing metric: unknown/null. Zero is a known measured zero.
- Cross-platform comparison: show separate platform rows and normalized comparisons only when a transparent methodology exists.

## 9. Success criteria for MVP

- User can create an episode, add distributions for all 3 target platforms, and record multiple metric snapshots.
- Missing values remain null through persistence, CSV round-trip, charts, and AI summaries.
- User can compare 24h/7d snapshots where data exists and see when comparisons are not equivalent.
- Import preview blocks malformed data from being silently committed.
- Core pages have loading, empty, error, and success states.
- AI connection can fail without breaking core app; no secret is rendered to client/logs.
- Quality gates in `docs/testing/QUALITY_GATES.md` pass or have documented, explicit exceptions.

## 10. Risks and assumptions

- Platform analytics fields and definitions change; keep metric definitions configurable and source-documented.
- Manual entry creates inconsistent timestamps; provide timezone and post-age clarity.
- Small sample sizes make apparent patterns unreliable; show sample size and confidence caveats.
- Subscription authentication availability and provider terms can change; validate current official docs before each auth implementation.
- This PRD assumes single-user local use. Multi-user/cloud deployment requires a new threat model and architecture review.
