# Release notes

## 0.1.0 — first local MVP (2026-10-24)

SignalForge — Content Intelligence helps one creator record cross-platform content metrics by hand, compare posts fairly, run content experiments, and (optionally) ask an AI assistant for a reviewed summary. Everything runs on the creator's own computer, bound to loopback.

### What is in this release
- **Measure:** episodes with tags, distributions for Facebook / YouTube / TikTok, append-only metric snapshots, configurable metric definitions, time zone and comparison windows. Unknown values stay empty; only a measured value can be 0.
- **Understand:** analytics at equivalent post age, per platform (never summed across platforms), with data-quality counts, trend charts that have a table twin, rankings with sample-size warnings, and per-episode performance.
- **Experiment / Improve:** hypotheses with a success threshold fixed before the experiment runs, linked baseline and variant posts, observational per-platform evidence, inconclusive as a valid result, and an append-only decision log.
- **Data:** CSV template, import with preview and all-or-nothing commit, CSV export (formula-injection guard), consistent backups, validated restore with a typed confirmation.
- **AI (optional):** Claude (Claude Code CLI) and Codex (app-server) connections through their official sign-in, a consented and minimized analysis payload, and a six-section advisory result rendered as inert text. The dashboard works fully without AI.
- **Interface:** logo and favicon, icons (react-icons, Lucide set), keyboard-reachable controls with visible focus, a short page-enter animation that respects reduced-motion, responsive layouts checked for horizontal overflow at 320–1280 px (320 px for the AI pages, 360 px for the others).

### Verified
See `docs/delivery/IMPLEMENTATION_LOG.md` (entry "M6–M8") for the exact commands, counts and results of this release.

### Known limitations
- `node:sqlite` is still experimental in Node.js; Node ≥ 22.13 is required.
- AI adapters are tested against fake CLIs and an in-process fake provider only. A real Claude/Codex login and real inference were not run in this repository, and real CLI output may differ between versions.
- Screen-reader and automated axe audits were not run; only Chromium was tested.
- Experiments cannot be reopened after they finish; evidence is observational, never causal.
- No dark theme, demo data, or separate tag management.
- Single local user: no authentication, no hosting. Do not expose the server beyond loopback without a reviewed ADR and security plan.

### Upgrading and recovery
Opening the app on a newer schema creates a backup in `<data dir>/backups/` before migrating. To go back, stop the server and replace `signalforge.sqlite` with that backup.
