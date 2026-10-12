# Interface decisions

Assumed user: a driver or dispatcher comparing a planned North American trip. The decision is which of three routes has less forecast exposure under the assessment policy, with time as the final tie-breaker.

The desktop layout keeps trip inputs and route comparison next to the map. Checkpoint details remain available in a table; essential information does not require using map tooltips. On narrow screens the sections stack in task order. The forecast slider inspects a fixed departure-based 48-hour window independently of route selection.

Font: locally bundled Inter Variable, with sans-serif fallback. Roles: page title 20/650; section title 16/650; body/control 13–14/400–600; supporting data 12/400; compact legend 11/400. No additional display fonts. Inter's variable font uses the declared weights.

Palette: ink #1e3235, secondary text #56696b, surface #ffffff, background #f4f6f5, boundary #dce4e1, primary #17634e, primary hover #104b3b, selection #edf5f0, focus #225cc7. Risk colors: Low #207258, Moderate #a66a09, High #d25b23, Severe #b12f42, No Travel #622a70. Risk is always also expressed as text; ordinal risk is not a probability.

Spacing: 4/8/12/16/20/24/28/32 px. Controls: 42–44 px high. Panel radius: 8 px; control radius: 6 px. Subtle elevation applies only to map overlays, city results, and help disclosure. Icons: Lucide, with accessible names on icon-only actions.

States: initial, planning, cancelled, invalid, failed, results, changed inputs, and all routes blocked. Changed trip inputs leave the previous result visible with an explicit update message. No provider failure can silently replace weather with zeros or a demonstration fixture. Existing results remain visible if a refresh fails.

Map provider colors and labels belong to the basemap; the application overlays follow this palette. Geographic cells are a sampled risk field, not a radar image. Road segments show arrival-based risk while the cells show the slider's absolute forecast time. These distinct meanings are explained in the recommendation disclosure.
