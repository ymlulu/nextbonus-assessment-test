# Marriott cross-issuer matrix with minimal follow-up

Independent Assessment project only; no Discover or production NextBonus changes.

## Source and ownership

Source: reviewed Bank Rules.xlsx, Special Matrix / Marriott Cross-Issuer, snapshot 2026-09-12. Stored as a non-sensitive, read-only data/marriott-eligibility-matrix.json: eight historical groups times five targets (40 target-by-history cells).

Independent engine: engines/marriott-matrix-v1.js. It is shareable with future Chase Marriott assessments but Amex Bevy, Brilliant, and Business are the three connected targets. Product-specific Offer terms supersede the model. Standard offer is an assumption, never a live verified term. NLL does not override separate 30/90/24 restrictions.

## Evaluation first, ask second

1. Determine the selected target and applicable matrix cells without asking the user.
2. If prior-card history is already available, reuse it. Ignore OK cells and handle LL / family clauses in the separate Amex lifetime engine.
3. If relevant history is missing, ask one grouped set of historical card names. The choice list contains only groups that might change the selected target outcome.
4. For each relevant selected card, first test already-known values, then ask only missing decisive facts: currently held; if not, closed within 30 days; approved/opened within 90 days; bonus or upgrade award within 24 months.
5. Any confirmed triggered clause stops unnecessary date follow-ups. If all applicable conditions are false, return CLEAR. Missing decisive facts yield MISSING, not a generic REVIEW and not an implicit pass.
6. Applying for Marriott Business with Ritz history alone is an OK cell: no Ritz date follow-up. Bevy and Brilliant restrictions are asymmetric. Historic Bevy alone does not block Brilliant under the source's 2026 family-language reversal.

The existing local API accepts:
- F07_MARRIOTT_HISTORY: array of chosen prior-card labels, or ["NONE"]
- F07_MARRIOTT_DETAILS: object keyed by source prior ID (e.g. chase_ritz_carlton), with YES/NO fields held_now, closed_within_30d, approved_within_90d, bonus_or_upgrade_within_24m.

The matrix returns questions only for facts not already resolved. Application risk and welcome bonus signals stay separate. There is no network upload or storage of answers; everything executes in browser memory.

## Verification and limits

Run node tests/marriott-matrix-dynamic.cjs plus full standalone Assessment regression. The rule snapshot alone does not verify a particular live Offer or decide issuer underwriting; unknown source identities or contradictory history remain unresolved. Chase product support beyond this shared matrix is outside this PR.
