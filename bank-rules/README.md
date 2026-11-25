# Bank Rules — authoritative executable data

The active dynamic questionnaire (`dynamic-questionnaire.html`) uses this directory only for AMEX/CHASE rules. The old Bank Rules.xlsx (snapshot 2026-09-12) is historical/reference material. Retired 129-row runtime index and issuer-specific policy files have been removed; git history preserves them.

- rules.json: each row has a unique id, exact target, optional offer_clause, executable condition and nonzero effect. Matrix restrictions are ordinary rules, not separate imperative code.
- facts.json: user-visible fact definitions, answer identity, groups and labels. Only predicates determine numeric option boundaries and relevant history choices.
- products.json: explicit identity-to-canonical-scope overrides and deliberately unlisted target scopes (not selectable products).
- approval.json: base credit risk model and common questions (separate from bank rules).

Conditions: {fact, op: "gte" | "gt" | "lt" | "lte" | "eq" | "includes_any", value/values}; {all:[...]}; {any:[...]}. $TARGET resolves the exact product name. A grouped time fact adds prior. Optional when gates a condition using another user fact; optional review is evaluated after the main condition is false; value_from: "condition.value" references its threshold. A matched leaf can specify action WAIT/BLOCK. Effects: application and bonus 0–3, optional explicit action, product_gate (no new-product bonus path while the product is unavailable). Optional target overrides replace the effect and/or the condition. The first matching override wins. Offer-dependent rules use exact clause states; the explicitly labeled test-page STANDARD/NLL scenarios simulate those states. Missing inputs are never silently cleared.

Add/remove/edit rows here; the same interpreter selects rules, derives questions, calculates results and aggregates maximum impacts independently. A new operator or unsupported fact type requires a reviewed generic engine change. A time-window change requires a matching fact definition and answer key (do not reuse answers for a different time window). No user responses leave the device.

Source: Bank Rules.xlsx, Rule Database / Rule Applicability / Special Matrix, snapshot 2026-09-12. AMEX-010 remains disabled (not in active rules). Product-gate projection and exact Marriott new-card-vs-upgrade interpretation preserve the reviewed runtime changes. Source workbook remains unchanged. Other banks are not yet migrated into this executable library. The old full-report/bridge tester still has a frozen independent runtime; do not edit it to change the new questionnaire. Its historical regression tests remain separate. Current questionnaire CI checks typed definitions, catalog coverage, active rules, rule mutations and actual browser behavior.
