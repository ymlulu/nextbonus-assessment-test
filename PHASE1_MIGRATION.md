# Phase 1 data-driven migration

The browser loads the runtime manifest, 18 rule definitions, 18 machine predicates, and six exported timing results before enabling the Assessment. `normalizeAssessmentFacts()` converts the existing Chinese UI answers into typed facts. `BankRuleEngine.evaluate()` evaluates only the JSON DSL and returns the existing Bank Rules envelope.

## Source gaps

The supplied Bank Rules v0.5 workbook contains direct rows for 13 of the 18 rules used by the deployed sandbox. `AMEX-011`, `BILT-001`, `BILT-003`, `CHASE-PROD-017`, and `CITI-PROD-009` are not present as matching Rule ID rows. Their Phase 1 JSON definitions and predicates therefore preserve the deployed implementation exactly; they were not inferred from workbook prose.

The supplied Offer Timing workbook stores Timing Output as formulas without cached calculated values readable by `openpyxl`. The exporter verifies the six IDs and current comparable values/units against the workbook, then preserves the reviewed deployed timing result snapshot. Recalculating the full workbook model belongs in a later phase.

## Remaining hardcode in index.html

Approval, long-term value, orchestration/final-action mapping, questions, report templates, copy, application URLs, and card metadata remain in `index.html`. They are outside Phase 1.
