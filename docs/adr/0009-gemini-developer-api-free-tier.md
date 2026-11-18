# ADR 0009: Gemini Developer API Free Tier

- Status: Accepted
- Date: 2026-11-17
- Builds on: ADR 0008 (local AI provider adapters)

## Context

SignalForge should add Gemini to its optional, consent-based analytics analysis while preserving its local-first posture. Google changed Gemini CLI access for individual free accounts in June 2026. Google's Gemini Developer API still lists selected models on its Free Tier, but model access, quotas, privacy terms, and pricing can change.

## Decision

- Call Google's official Gemini Developer API from server-only code using native `fetch`; no additional SDK dependency is required.
- Fix the model to `gemini-3.5-flash-lite`, currently listed with free standard input/output. The app does not accept model selection or enable tools/grounding. Recheck the official pricing/model pages before future releases.
- **Verification note (2026-11-17):** the model was confirmed to exist and to answer live — `GET /v1beta/models` listed `models/gemini-3.5-flash-lite` and a real `generateContent` call returned HTTP 200, `finishReason: STOP`, `serviceTier: standard`. Google's pricing page could not be re-read during that session (no network access to fetch it), so the "listed as free" statement above rests on the earlier reading and was NOT re-confirmed at that time. The client cannot observe a key's billing entitlement; a successful call does not prove the key is on the Free Tier rather than a billed project.
- Read `GEMINI_API_KEY` only from the server process environment. SignalForge does not write or persist it in project `.env` files, include it in client responses, or log it. The setup guide uses hidden terminal input and removes the variable after the local server exits.
- Require the existing explicit preview/consent flow before inference; disclose that Google may use Free Tier prompts and responses to improve products.
- Health status checks only whether a key exists locally; it does not claim the key is valid, that the account has free quota, or that billing is disabled. A real request is only made by the consented connection test or analysis action.
- Cap response bytes, generation tokens, duration, concurrency, and request frequency; normalize HTTP and network errors without surfacing provider response text.
- Treat only a complete answer as usable: `thinking` parts (the model's private reasoning) are dropped and never reach the user, and a non-`STOP` finish reason (`SAFETY`, `MAX_TOKENS`, `RECITATION`) is rejected as an invalid response instead of rendering a partial or blocked answer.

## Consequences

- Users need a Google AI Studio API key configured in the terminal session that starts SignalForge. The app never asks them to paste it into a UI field or project file.
- A Free Tier model does not guarantee a particular account/project is free of billing; users must use an AI Studio Free Tier project without paid billing. Free Tier prompts may be used to improve Google's products.
- Real account auth and inference remain unverified until a user deliberately configures a key and approves a request.
- Google may change model availability, quotas, data terms, and billing. Update the model and disclosures only after checking current official docs.

## References

- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Google AI Studio API keys: https://aistudio.google.com/apikey
- Google Developers Blog, Gemini CLI transition: https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
