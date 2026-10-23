# Design Reference Research

Research checked: 23 October 2026. These links are inspiration/reference material, not assets to copy. Review the actual screens before implementation and capture any final choices in a design decision record.

## 1. Dribbble references

### Social Media Analytics Dashboard UI — Masum Billah
https://dribbble.com/shots/27355428-Social-Media-Analytics-Dashboard-UI
- Useful for: multi-channel account overview, metric hierarchy, chart/card balance, restrained neutral surfaces.
- Adaptation: keep platform-specific metric labels and snapshot age visible; do not imply that all metrics are comparable.

### Creator Analytics Dashboard — Narima Digital
https://dribbble.com/shots/27655270-Creator-Analytics-Dashboard
- Useful for: creator-oriented overview, content-performance lists, separate AI insight area.
- Adaptation: insights should show evidence, limitations, sample size, and a next experiment, not only a confident AI-generated sentence.

### Social Media Analytics Dashboard — Blend wrk
https://dribbble.com/shots/27017766-Social-Media-Analytics-Dashboard-UI
- Useful for: platform comparison, growth and audience metric organization, modern light theme.
- Adaptation: support incomplete historical data and manual snapshots; no fake real-time values.

### Social Media Analytics Dashboard — Valkyrie Studios
https://dribbble.com/shots/26431421-Social-Media-Analytics-Dashboard-Modern-UI-Kit
- Useful for: card-based analytics and reusable visual modules.
- Adaptation: use cards selectively; avoid turning every data row into a card, especially in dense tables.

### Dribbble discovery pages
- Social media dashboard: https://dribbble.com/search/Social-media-dashboard-design
- Social media analytics dashboard tag: https://dribbble.com/tags/social-media-analytics-dashboard
- Data analytics dashboard: https://dribbble.com/search/data-analytics-dashboard

## 2. Shipped-product and pattern references

### Mobbin — dashboard design study
https://mobbin.com/blog/what-good-dashboard-design-looks-like
- Useful principle: a dashboard should prioritize what the user needs to decide, not maximize the number of widgets.
- Use as a reminder to make the overview answer “what changed, what is reliable, and what should I inspect next?”

### SaaSUI — SaaS dashboard inspiration directory
https://www.saasui.design/best-saas-dashboard-ui-inspiration
- Use for shipped-product context, screen-level patterns, navigation and data visualization.

### Dashboard Design Patterns
https://dashboarddesignpatterns.github.io/patterns.html
- Useful for vocabulary around visual encoding, information structure, interaction, and screen-space usage.

## 3. Synthesis for this product

Recommended direction: **calm editorial analytics** — light neutral canvas, clear typography, restrained platform accents, strong table readability, small purposeful charts, and an evidence-first AI panel. A dark theme can be added later if it does not complicate accessibility or charts.

### Layout proposal
- Left sidebar: Overview, Episodes, Analytics, Experiments, Imports & Exports, Settings.
- Top bar: page title, date/window selector, platform filter, quick add action.
- Overview: compact KPI row; performance trend; platform comparison; recent episodes table; “Data quality / missing history” note; optional “Next experiment” panel.
- Episode detail: episode metadata; platform distribution tabs; snapshot timeline; metric table; notes/tags; linked experiments.
- Analytics: filter bar; equivalent-age window selector; platform-separated trend; sortable content table; compare drawer.
- AI Connections: separate Claude and Codex provider cards; status, last check, setup steps, connect/sign-in action, test connection, safe diagnostics.

### Visual principles
- Use one strong primary accent plus semantic status colors; do not assign unrelated rainbow colors to every metric.
- Platform colors may be used as small identifiers, but charts must remain distinguishable in grayscale and for color-vision deficiencies.
- Use consistent spacing, restrained borders, minimal shadows, readable numeric alignment, and clear units.
- Every chart has a title, axis labels/units where useful, timeframe, and empty state.
- Every KPI shows comparison basis (e.g. previous period or 24h window), not just an unexplained delta.
- Use tables for detailed metric comparison; use cards for summary, not all records.
- Responsive: desktop-first density, but at mobile widths collapse filters into a sheet and convert wide tables to horizontally scrollable or detail views.
- Include skeleton/loading, no-data, partial-data, provider-disconnected, import-error, and permission/error states.

## 4. What not to copy

- Decorative glassmorphism that reduces contrast.
- Fake live counters or fabricated audience demographics.
- Universal engagement score with no transparent formula.
- AI insight cards that state correlation as causality.
- Tiny charts with no labels, unclear color meaning, or no date range.
- “Connect all social platforms” buttons that imply APIs exist when this MVP uses manual data entry.

## 5. Design validation checklist

Before finalizing the UI, validate:
- Can a user see which platform and post age each metric belongs to?
- Can a user tell `0` from unknown/missing?
- Can a user spot incomplete historical data without being misled?
- Does the overview support a decision in under 10 seconds?
- Can all core actions be completed with keyboard only?
- Do tables, charts, dialogs, and AI setup work at 360px, 768px, and desktop widths?
