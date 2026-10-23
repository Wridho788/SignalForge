# ADR 0003: Preserve missingness and compare equivalent observation windows

- Status: Accepted (project owner instructed to proceed with M0–M3 on 2026-10-23)
- Date: 2026-10-23

## Context
Historical platform data may be incomplete and platform metrics are not necessarily equivalent. Converting unknown values to zero or comparing arbitrary post ages creates misleading conclusions.

## Decision
Represent unknown/unavailable/not-applicable states explicitly. Compare at equivalent post ages only with a documented tolerance and display actual age. Keep platform-specific metrics separate unless definitions and units are compatible.

## Consequences
Analytics may show fewer comparisons, but those comparisons are more trustworthy. UI must communicate missing data and comparison limitations clearly.
