# All bank rule audit

Source: reviewed Bank Rules.xlsx (2026-09-12), Rule Database, Rule Applicability, Special Matrix; current rules.json.

The independent acceptance suite tests each executable rule, numeric boundaries, product scope, history choices, offer gates, and all 40 original matrix cells. The four missing catalog targets (United Club, Iberia Visa, Aer Lingus Visa, Southwest Premier Business) use explicitly synthetic identities in tests only, not selectable products.

Open business review items (not changed by this PR):
- AMEX-008: the workbook says "near or at 10"; current runtime uses >=10. A threshold below ten requires explicit review.
- CHASE-005: known no-fee Ink products trigger bonus impact 2; unidentified other no-fee business product history is a review state. Confirm the product set and intended handling.
- CHASE-PROD-013: the current Club lineage and exact target bonus scope must be verified when the missing product identity is added.
- The 24m/90d/30d facts are answered directly in the questionnaire. They are not inferred from exact dates; the suite tests the resulting boolean facts, not date arithmetic.
- This checks the reviewed snapshot and current model, not fresh live issuer terms. Legacy Full Report and Bridge are frozen repository-only baselines.

## Citi migration

17 executable rows from the reviewed Bank Rules.xlsx; 2 zero-impact exceptions are represented by exact product/offer scope, 2 historical references and 1 inactive Custom Cash status are not executed. 8-day application spacing is soft impact 2; 65-day threshold is two submitted applications including declines; business spacing is strictly less than 90 days (95-day buffer is not an executable threshold). 48-month bonus receipt, conversion of a previously rewarded account and AT&T opening-offer receipt use three distinct facts. Standard modeled clauses are explicitly scoped; exact offer gates require separately confirmed clauses. Costco membership is a product gate; Costco bonus clauses remain unknown in this snapshot rather than assumed absent. The 3 legacy Citi product identities (Premier and Rewards+ variants) are history/validation scopes only; current application availability is not verified. No bank-specific evaluator was added. All rules are historical snapshot models, not current live term verification.

## Remaining seven issuer/brand families

28 executable rows migrated from the 39 remaining source rows: BofA 4, Capital One 6, Wells Fargo 9, Discover 2, Barclays 1, U.S. Bank 4, Bilt 2. The other 11 source rows are meta guards, inactive or historical references; no zero-impact rule is executed. Exact clause states not established for a target remain unknown, and offer-specific caps require an exact positive integer threshold. BofA 24-month availability and WF soft warnings retain impact 2; Capital One 1/6 and US Bank 0/6 or 1/12 are impact 1 heuristics. Venture family direction, legacy Hotels.com scope, Cash Rewards Visa exact identity, and Column Bilt 2.0 versus legacy Wells Fargo Bilt are preserved. Discover is a separate brand model and does not inherit Capital One rules. BofA Ascent legacy Alaska equivalence requires confirmed issuer identity; no automatic Alaska-name match. Source does not establish a new hard rule for the missing Barclays/USB/Summit terms; these are coverage diagnostics only. No live term verification or new issuer-specific evaluator. 118 selectable cards, including two Choice identities from the source rules. Existing AMEX/Chase/Citi rule definitions unchanged.

- Wells Fargo Signify Business Cash has no applicable commercial-card rule in the reviewed snapshot. It retains all four base credit questions and reports explicit application/bonus coverage gaps; no invented bank-specific question or automatic eligibility clearance.
