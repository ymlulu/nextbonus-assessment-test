# Full Report offer history

## Existing integration

The deployed entry is `index.html`. Its existing `renderReport(r)` uses `section('当前开卡奖励', o.offerRating, rep.offerText)`. `rep.offerText` comes from the unchanged `NBEngine.evaluate`/`offerText` renderer; `o.offerRating` comes from the existing orchestrator. The only integration adds a chart container inside that section and calls `OfferHistoryChart.mount`.

There was no data directory, script directory, JSON layer, SVG component, chart library or build script. This adds a read-only Python export and a dependency-free browser component. No Excel files are shipped or modified.

| File | Purpose |
|---|---|
| index.html | Load chart CSS/JS; mount only in the current-offer report section |
| assets/offer-history-chart.js | Generic SVG step chart, current highlight, hover/tap/keyboard details and graceful failure |
| assets/offer-history-chart.css | Compact responsive styling |
| scripts/export_offer_history.py | Read source workbook, validate and export; no valuation or formula evaluation |
| data/offer-history.json | All 98 products keyed by Offer Timing ID; current separate from 406 original history records |
| data/offer-history-validation.json | Source SHA-256 and all row-specific validation messages |
| tests/offer-history.cjs | Six-card UI, responsive, interaction, navigation and failure tests |
| tests/business-regression.cjs | Verify unchanged config/engine and 384 business-output cases against pre-change deployed HTML |
| tests/test_export_offer_history.py | Precision/numeric/export contract tests |
| .gitignore | Exclude local Python caches and scratch files |

## Product mapping

The component uses the existing `r.card.timing.timingId`, never fuzzy card-name matching or card-specific chart logic.

| Existing card_key | Offer Timing ID | Eligible records / plotted historical nodes |
|---|---|---|
| chase_sapphire_preferred | OT-CHASE-010 | 19 / 18 |
| amex_gold | OT-AMEX-002 | 6 / 5 |
| amex_platinum | OT-AMEX-001 | 8 / 6 |
| bilt_palladium | OT-BILTCOLUMN-011 | 1 / 1 |
| capital_one_venture_x | OT-CAPITALONE-013 | 6 / 4 |
| citi_strata_elite | OT-CITI-015 | 5 / 3 |

Same-date equal-value records share a node; details retain every original offer/spend label. Current is a separate highlighted node, appended only for rendering, with the frozen Assessment date. Y position uses only the supplied Comparable Value. Values/valuations are not displayed. AS_HIGH_AS labels always retain 最高可达; mixed rewards retain their full label.

## Display filter v1

Require matching ID, issuer/card/type, Timing Eligible=YES, Confidence=HIGH, finite numeric Comparable Value, same nonempty Comparison Unit as current, a nonempty bonus label, and usable date precision. Exclude benchmark/research-only, APPROX, UNKNOWN, invalid/missing date, dates later than the workbook evaluation date, exact duplicate display records, and all conflicting-value records sharing a display date. Raw records remain in `history` with source row, raw fields, eligibility and exclusion reasons.

DAY/EXACT displays the date; MONTH displays only year-month; QUARTER displays year-quarter; YEAR displays year. Source-specific EXACT_OR_MONTH and EXACT_END/MONTH_START conservatively display the month, never claim a known day. Internal coordinates use the start of the known period. Conflicts created by that conservative date mapping are reported and excluded rather than arbitrarily ordered.

Zero eligible records show 目前可比较的历史奖励数据还比较少。 One history record plus current uses the same two-node comparison. Missing/failed/malformed JSON leaves the original text report intact. Opening index.html directly offline preserves the existing text Assessment; the chart requires serving the static JSON over HTTP (GitHub Pages or a local static server).

## Source and data-quality review

Source: supplied `Offer%20Timing.xlsx`; 98 products, 406 historical records, 350 display-eligible records. Original workbook unchanged. 224 validation messages include expected display exclusions and 98 missing cached Timing Output results, not 224 independent source defects.

Timing Engine/Timing Output contain formulas without cached results. Exported `offer_rating` and `wait_recommendation` are null; the component never uses them to replace the existing Assessment snapshot, never evaluates formulas, and never substitutes QA expected values. A future data update that changes the current offer must be reviewed alongside the existing current-offer snapshot before merging to avoid text/chart mismatch.

Full20Template20V1.xlsx: inspected Offer Display Rules and Renderer Contract. The DISPLAY_ELIGIBLE policy agrees with the filter above; AS_HIGH_AS warning and current text templates remain unchanged. The source registry explicitly contains OFFER_WAIT_APPEND with 可以考虑等一等. This explains the previously reported wording, but does not authorize changing the existing copy in this chart-only task.

Specific source issues (all in Offer History; Excel unchanged):

| ID | Rows | Finding / suggested source review |
|---|---|---|
| OT-U.S.BANK-057 | 183 | Missing numeric comparable value/unit; confirm comparable reward or retain research exclusion |
| OT-U.S.BANK-088 | 247, 249 | Missing numeric comparable value/unit; confirm comparable reward or retain research exclusion |
| OT-AMEX-001 | 374, 375 | Duplicate display record; retain both raw rows, display one; confirm duplicate at source |
| OT-U.S.BANK-089 | 251–254 | Two duplicate pairs; retain raw rows, display one per pair |
| OT-CITI-008 | 27, 319 | Conflicting value in 2025-10; clarify chronology/offer distinction |
| OT-CHASE-047 | 152, 153 | Conflicting value in 2025-07; clarify chronology/offer distinction |
| OT-U.S.BANK-055 | 176, 177 | Conflicting value in 2024-08; clarify chronology/offer distinction |
| OT-U.S.BANK-056 | 181, 182 | Conflicting value in 2021-05; clarify chronology/offer distinction |

Full per-row exclusions, including confidence, research and precision, are in `data/offer-history-validation.json`.

## BUSINESS LOGIC ISSUES

NO Assessment business logic changes. Pre-existing AMEX blank bonus-history handling still returns 可以 instead of 不确定; outside this task. Existing final action, rules, bonus, timing, approval, long-term and CTA output remain untouched. Missing Excel formula caches prevent independently verifying Timing Output, but do not block display of supplied historical values. Source corrections and business changes require separate confirmation.

## Reviewed update process

Run Python 3 with openpyxl installed (export-time only):

```sh
python scripts/export_offer_history.py '/path/to/Offer Timing.xlsx'
python tests/test_export_offer_history.py
node tests/business-regression.cjs /path/to/pre-change-deployed-index.html
node tests/offer-history.cjs
```

UI tests require Playwright and an installed Edge browser; set PLAYWRIGHT_MODULE to a bundled Playwright module if it is not on the Node module path. QA_OUTPUT chooses the screenshot/result directory; QA_URL optionally runs against the live Pages URL. Neither dependency is needed by the website.

Review JSON diff and validation report on a feature branch, verify current-offer data aligns with the existing Assessment snapshot, open/review a PR, then merge and let the existing main-branch Pages workflow publish. Excel changes never update the live site automatically. Keep prior commits for rollback. Export contains no timestamp dependent on the export machine and is reproducible for the same input workbook.

## Verification

Local browser: A–F six-card charts pass; G/H one/zero history pass; I cross-unit exclusion passes; J month precision passes; quarter/year fixtures pass; K 375px and 390px tap/no-overflow pass; L round-trip preserves the exact stored assessment with evaluation replaced by a throwing stub; M JSON failure preserves the original report. Hover and keyboard focus/Enter work. No JavaScript errors. Screenshots reviewed for CSP, Gold, Venture X and mobile.

Business config and engine are byte-identical to deployed commit cbc85ac. All 384 generated evaluation cases produce identical complete JSON outputs. Export tests pass. Historical high is a display-only maximum over eligible records, not a new offer rating.
