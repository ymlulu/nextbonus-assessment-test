# Phase 1 data-driven migration

The browser loads the runtime manifest, 18 rule definitions, 18 machine predicates, and six exported timing results before enabling the Assessment. `normalizeAssessmentFacts()` converts the existing Chinese UI answers into typed facts. `BankRuleEngine.evaluate()` evaluates only the JSON DSL and returns the existing Bank Rules envelope.

## Current official-source verification

The initial Codex run used an older Bank Rules v0.5 workbook and therefore reported five missing Rule IDs. The current official `Bank Rules.xlsx` (128-rule snapshot, modified 2026-09-12) has now been re-read directly from Drive. All 18 Phase 1 runtime Rule IDs are present in both `Rule Database` and `Rule Applicability`, including `AMEX-011`, `BILT-001`, `BILT-003`, `CHASE-PROD-017`, and `CITI-PROD-009`.

The official workbook values for Dimension, Application Impact / Bonus Impact, Hard Resolution Policy, ACTIVE status, and Rule Applicability audit status match the Phase 1 runtime contract for all 18 migrated rules. The machine predicates remain explicit reviewed runtime mappings; they are not inferred from natural-language Scope, Condition / Trigger, Evaluation Logic, or other prose fields.

`scripts/export_bank_rules.py` now validates these executable effect fields directly against the official workbook instead of merely checking Rule ID presence. A source/runtime mismatch fails the build rather than silently preserving stale runtime effects.

The current official Offer Timing workbook was also re-read directly. The six launch-card IDs, current comparable values/units/mechanisms, and reviewed timing rating/wait results match the Phase 1 runtime snapshot. Timing Output remains formula-based, so Phase 1 ships the reviewed deterministic timing result snapshot rather than interpreting spreadsheet formulas in the browser.

## Remaining hardcode in index.html

Approval, long-term value, orchestration/final-action mapping, questions, report templates, copy, application URLs, and card metadata remain in `index.html`. They are outside Phase 1.
