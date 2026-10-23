# Design System and UX Rules

## Product feel
Calm, precise, creator-friendly, and analytical. The interface should reduce anxiety around metrics rather than make every fluctuation feel like a crisis.

## Design tokens — initial proposal
These are proposals, not existing brand facts. Tune them after the first implemented screen and contrast checks.

- Canvas: warm/cool neutral near-white.
- Surface: white; subtle neutral border.
- Text: high-contrast charcoal; secondary text muted but still readable.
- Primary accent: indigo/blue-violet used for primary actions and selected states.
- Semantic states: green = positive/healthy, amber = caution/incomplete, red = failure/destructive; never rely on color alone.
- Typography: system UI or Inter-like sans serif; tabular numerals for metric values.
- Radius: moderate, consistent; avoid excessive pill-shaped controls in dense work areas.
- Spacing: use a documented 4px-based scale.

## Component standards

### KPI tile
- Label, value with unit, comparison basis, period, optional trend.
- Unknown values display “—” plus a short explanation, never 0 by default.
- Trend delta is hidden or marked unavailable when baseline is zero/unknown.

### Metric chart
- Title + platform/filter context + time window.
- Tooltip exposes exact date, value, unit, snapshot age and provenance.
- Missing data creates a visible gap; never interpolate unknown values without labeling it.
- Include accessible text/table alternative for essential chart data.

### Table
- Right-align numeric columns; use tabular numerals.
- Show metric unit and observation window in header/tooltip.
- Use sticky headers only when helpful; keep sorting/filter state visible.
- Include row-level empty and error states, pagination/virtualization only if needed.

### Forms
- Labels above fields; inline validation near the field.
- Use explicit timezone for timestamps and preview parsed local time.
- Confirm destructive actions; do not use confirm dialogs for routine actions.

### AI insight panel
Sections: Summary, Evidence, Limitations, Hypotheses, Next experiment, Success criteria.
Show provider and model if available, generated time, data range and data subset. Display a reminder that AI output is advisory. Allow retry/cancel and copy/export without executing suggested actions automatically.

### AI provider card
Fields: provider name, integration method, installed/authenticated/connected status, last checked time, “Connect / Sign in”, “Test connection”, “How to set up”, safe error summary. Never show token values or token input fields.

## Accessibility
- WCAG AA contrast target.
- Keyboard-accessible navigation, dialogs, menus, date pickers, tables and charts.
- Visible focus ring and meaningful accessible names.
- Respect reduced motion.
- Do not encode status by color alone.
- Announce async status changes politely to assistive technology.

## Responsive behavior
- Desktop: persistent sidebar and dense analytics canvas.
- Tablet: collapsible sidebar; two-column cards only when width supports it.
- Mobile: one-column KPI stack, filter drawer, horizontally scrollable tables or per-record detail views, full-width primary action.

## Copy and tone
Use clear Indonesian by default unless user selects another language. Prefer “Data belum tersedia” over “0”. Prefer “indikasi” or “hipotesis” over “penyebab” unless causality is supported by a controlled experiment.
