# AMEX / Chase rule audit

Source: reviewed Bank Rules.xlsx (2026-09-12), Rule Database, Rule Applicability, Special Matrix; current rules.json.

The independent acceptance suite tests each executable rule, numeric boundaries, product scope, history choices, offer gates, and all 40 original matrix cells. The four missing catalog targets (United Club, Iberia Visa, Aer Lingus Visa, Southwest Premier Business) use explicitly synthetic identities in tests only, not selectable products.

Open business review items (not changed by this PR):
- AMEX-008: the workbook says "near or at 10"; current runtime uses >=10. A threshold below ten requires explicit review.
- CHASE-005: known no-fee Ink products trigger bonus impact 2; unidentified other no-fee business product history is a review state. Confirm the product set and intended handling.
- CHASE-PROD-013: the current Club lineage and exact target bonus scope must be verified when the missing product identity is added.
- The 24m/90d/30d facts are answered directly in the questionnaire. They are not inferred from exact dates; the suite tests the resulting boolean facts, not date arithmetic.
- This checks the reviewed snapshot and current model, not fresh live issuer terms. Legacy Full Report and Bridge cleanup remains separate.
