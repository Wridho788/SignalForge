# ADR 0001: Local-first single-user architecture with SQLite

- Status: Accepted (project owner instructed to proceed with M0–M3 on 2026-10-23)
- Date: 2026-10-23

## Context
SignalForge initially serves one creator entering platform metrics manually. A mandatory cloud database would increase cost, deployment complexity, and privacy exposure before the product has validated its core workflow.

## Decision
Use a local application with SQLite and bind the web server to loopback for MVP. Keep repositories and migrations isolated so persistence can be replaced later if product requirements change.

## Consequences
Positive:
- No cloud database bill or account setup required.
- Core records stay local.
- Straightforward backup/export model.

Negative:
- Backup and restore are user responsibilities unless later automated.
- Multi-device sync and collaboration are out of scope.
- Local browser endpoints still need CSRF/Origin and process-security defenses.

## Revisit when
Multi-user collaboration, remote access, or cloud sync becomes a concrete requirement.
