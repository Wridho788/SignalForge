# ADR 0002: Official provider-managed authentication for local AI connections

- Status: Accepted (project owner instructed to proceed with M0–M3 on 2026-10-23; accepted as a policy; first exercised in M7)
- Date: 2026-10-23

## Context
The user prefers using existing Claude and ChatGPT/Codex subscriptions where supported, rather than requiring API keys and separate usage billing. Provider auth policies and SDK behavior may change.

## Decision
Do not implement a generic token input. For Codex UI integration, evaluate official Codex app-server with its supported ChatGPT login flow. For Claude local integration, use official Claude Code/Agent SDK login mechanisms only where current plan and third-party-use terms permit. Never extract tokens from private credential files.

## Consequences
Positive:
- Better user control and less credential exposure.
- Can surface provider-specific auth and usage status.

Negative:
- CLI/app-server versions and provider terms can change.
- Login and rate-limit states require robust process/protocol handling.
- Subscription-based access is not guaranteed for every plan or third-party usage.

## Revisit when
Provider terms change, the app becomes hosted/commercial/multi-user, or a provider offers a dedicated supported integration API.
