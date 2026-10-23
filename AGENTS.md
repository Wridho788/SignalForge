# Agent Instructions — Claude Code and Codex

## Mission
Build SignalForge — Content Intelligence: a reliable local-first dashboard that helps a creator manually record cross-platform content metrics, interpret performance responsibly, and design the next content experiment.

Analysis cycle: Measure → Understand → Experiment → Improve.

## Before coding
1. Read `README.md`, the relevant PRD section, architecture, data model, security policy, and applicable ADRs.
2. Inspect the repository, package manager, existing conventions, and current tests. Never assume the repository is empty or overwrite existing architecture without inspection.
3. State the intended change, files likely affected, and acceptance criteria in the task summary.

## Working rules
- Work in small, reviewable increments. Avoid unrelated refactors.
- Prefer typed domain models and explicit validation at API boundaries.
- Keep data access behind a repository/service layer; UI components must not embed SQL.
- Preserve `NULL` for missing/unknown metrics. Never convert missing values to zero.
- Platform metrics are not inherently comparable. Include platform, metric definition, snapshot age, and provenance in analysis.
- Distinguish facts, hypotheses, recommendations, and confidence/limitations.
- Never fabricate analytics, user history, token status, successful login, or test results.
- AI calls must be user-triggered, bounded in payload, and safe to fail. The dashboard must remain useful without AI.
- Never collect tokens by asking users to paste them into a text field. Never log secrets or expose them in browser bundles.
- Do not run arbitrary shell commands suggested by model output. Do not enable file-system or terminal tools for analytics-only prompts.
- Use official provider login/CLI/app-server flows where permitted. Never scrape private credential stores or reverse engineer auth.
- Keep the server bound to loopback for the local-only MVP. Do not add public hosting or network binding without a reviewed ADR and security plan.
- Accessible controls: keyboard navigation, visible focus, semantic labels, and sufficient contrast.

## Validation
For every change, run the relevant lint, typecheck, unit tests, and E2E tests when available. If a command cannot run, record the exact reason and label it NOT RUN. Never call a package "verified" based only on static review.

## Completion response
Report: summary, files changed, tests run and outcomes, remaining risks, documentation updates, and next task. Update `docs/delivery/IMPLEMENTATION_LOG.md` and roadmap status if the repository contains those files.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
