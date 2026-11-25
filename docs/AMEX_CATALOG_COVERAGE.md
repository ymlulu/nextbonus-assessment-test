> Historical design record. The v1 dynamic questionnaire described below was retired in favor of [Bank Rules](../bank-rules/README.md). File paths and behavior below are not current implementation guidance.

# AMEX dynamic questionnaire · formal NextBonus catalog coverage

This work extends **only** the independent `ymlulu/nextbonus-assessment-test` project. It does not import Discover code, alter its data or modify the production NextBonus repository.

## Product catalog ownership

Use the reviewed **NextBonus formal Web catalog** as the identity source:

- Repository: `uscc101/nextbonus-web` (read-only); `main` commit `e1aa32f62a9cb4e806393d9afd5a2c835317e405`.
- Identity ledger: `docs/card-catalog/products.json`.
- Exactly **32 products** with `profile = packages/card-catalog/data/amex.json`.
- One legacy AMEX-branded Amazon Business Prime entry is **excluded** because `currentIssuerId = us-bank`; historical card artwork is not current issuing-bank identity.
- Independently kept: Schwab Platinum from Assessment’s reviewed rule/history registry, absent from the above official NB 32, and explicitly marked as an additional identity. Independent Assessment AMEX total is therefore **33**.
- `data/amex-formal-product-identities.json` is a **non-sensitive, metadata-only snapshot** (product names/IDs, canonical exact rule target, card form, personal/business, provenance). The 11 missing source identities were added to the independent `data/card-identity-index.json` (new index count: 109).
- This does not copy the formal repository's perks, fee details, business code, or offer terms. A catalog publication/review record is **not** proof a product is accepting new applications or that its current signup offer contains a given clause.

AMEX rule/card-form classification uses the formal catalog + audited rule target map. The Graphite Business Cash Unlimited card is identified as Pay Over Time / charge-style; its primary official Amex agreement is https://www.americanexpress.com/content/dam/amex/en-us/company/legal/cardmember-agreements/public-site-2026-q1-pdf-cmas/sbs-small-business/graphite-business-cash-unlimited-03-31-2026.pdf .

## Rule scope

The authoritative reviewed `Bank Rules.xlsx` snapshot contains **31 AMEX-related rows**:

- **22 active executable rule definitions** used for conservative questionnaire routing; AMEX-010 (1/5) is retained in the source snapshot but disabled in Assessment on user request.
- **8 other rows** (meta, reference, inactive): retained as exclusions/scope guards, not converted into user questions.
- Across the 32 formally cataloged cards, exact issuer, card-form, personal/business and product-name predicates are now routable.
- Existing frozen offer-term gates are honored for the two previously reviewed Assessment products. **For other cards, offer-dependent lifetime/family language is not assumed present or absent.** Pending clauses are shown as *system review required*, separate from the actionable questionnaire.
- Amex revolving card 2/90, charge-card count, and issuer same-product timing questions are based on actual card type. Do not reuse 2/90 revolving rules for charge cards.
- Holding history (F03) is separate from having received a welcome bonus (F04). NLL language is clause specific, **not** a global override.
- Personal Delta family language must not be applied to Business Delta. Different Hilton personal tiers are **not** declared mutually excluding. Marriott has a separate cross-issuer historical matrix needing current terms and dated history. Schwab and Morgan Stanley variants ask for the correct partner relationship.
- The Amex-specific question display comes from one `data/amex-questionnaire-policy.json`, interpreted by `adapters/amex-questionnaire-v1.js`. No hand-built questionnaire per card.

## Interface and privacy

`GET` static files: `data/card-identity-index.json`, `data/amex-formal-product-identities.json` (provenance snapshot), `data/amex-questionnaire-policy.json`, plus existing independent Assessment data. The browser runs pure functions to resolve card name/URL and compose questions. No POST, login, localStorage or remote scoring occurs. Answers remain in page memory.

The [standalone QA page](../dynamic-questionnaire.html) now displays schema-driven multiple-choice prior-card history, a type-specific Amex portfolio count, and a separate expandable list of offer clauses needing official verification. The test is deliberately **questionnaire-only** (`evaluation_ready: false`).

**Not completed:** independent HP sensitivity scoring, full 23-rule trigger evaluation for all cards, a live exact-offer snapshot for every Amex card, comprehensive cross-issuer Marriott trigger execution, production HTTP endpoints, or Discover integration. No complete approval or Welcome Bonus eligibility rating is implied by this PR.

## Tests

```sh
node tests/amex-catalog-coverage.cjs
node tests/card-name-to-questionnaire-v1.cjs
node tests/dynamic-questionnaire-v1.cjs
```

Coverage includes all 32 formal Amex IDs, 31 Amex rules, 33 independent Amex identities, merchant history and URL matching, personal/business Delta isolation, known-vs-unknown offer gates, 2/90 form routing; inactive 1/5 does not route, 3-dimensional facts, and local answer privacy. The full legacy Assessment CI suite remains required before merge.

## Standard-offer default and explicit NLL variants

Amex questionnaire *planning* defaults to `offer_variant: "STANDARD"` for all 32 formally cataloged cards. This models a **normal publicly offered signup bonus** and assumes the conventional same-card lifetime and applicable product family terms are present. This is a **scenario assumption** for deciding what the questionnaire must ask, **not** a claim that the current live URL was checked or that a person is bonus-ineligible.

Use an explicit special-offer variable when relevant:

```js
facade.plan({input:"American Express Gold Card"}); // STANDARD by default
facade.plan({input:"American Express Gold Card",offer_variant:"NLL"});
facade.plan({input:"American Express Gold Card",offer_variant:"NLL",
  offer_rule_overrides:{"AMEX-FL-004":"ABSENT"}});
```

- `STANDARD` treats the target's ordinary same-product and applicable **family** clauses as present *for questionnaire routing*, so no artificial "offer terms unresolved" blockage.
- `NLL` removes the **same-product lifetime** clause (`AMEX-001`) only. NLL never automatically removes an independent family restriction.
- `offer_rule_overrides` is a vetted, explicit per-rule map (`PRESENT`/`ABSENT`) and only accepts rules applicable to the selected target. A different special Offer may suppress both clauses when explicitly represented.
- This never overrides bank application-velocity, card-count or partner relationship rules; those are still queried normally.
- Unknown card metadata and uncompiled system predicates remain unknown rather than fabricating product eligibility.
- All user answers remain in browser memory; `evaluation_ready` stays false. The business-rule evaluation source workbook is unchanged, and standard-offer assumptions cannot be presented as verified official terms.

Regression: `node tests/amex-offer-context.cjs`.

## Actionable previous versions in Family Language (2026-11-24)

A vague checkbox such as "这些产品的旧版本" is **not a distinct card identity** and cannot determine an applicant's bonus status. The UI no longer offers the five generic "old version" labels as standalone facts. In standard-offer family rules with a documented previous-version scope, the historical version is now included with its exact modern card choice, e.g. `Delta SkyMiles Platinum (Personal)（含同产品旧版本）`. Selecting the card sends the **canonical product value** to the unchanged rule ID, resulting in a meaningful `TRIGGERED` vs `CLEAR` determination.

The 10 source-mapped generic labels were converted to `legacy_variant_scope_by_rule` metadata rather than deleting the underlying old-version scope. Specifically, the personal Delta family scopes `AMEX-FL-007` through `AMEX-FL-010` model old versions of Delta Blue, Gold, Platinum and Reserve in their target-appropriate rules. The exact target by history remains asymmetric. This is a standard-public-offer assumption, not a claim that a particular current special offer has that language.

The verification trail includes historical public Delta offer wording (Doctor of Credit) and 2026 independent family-language reporting (The Points Guy), recorded in `data/amex-questionnaire-policy.json`. The exact live application Offer remains unverified. Distinct predecessor products such as SPG Business and SPG Luxury remain individually identifiable options and, under their modeled current family scope, their selection now triggers the applicable bonus rule instead of an indefinite generic REVIEW. The internal test `tests/amex-previous-versions-actionable.cjs` confirms the choice changes the bonus result, rather than merely changing `MISSING` to `REVIEW`.

No approval prediction or guaranteed bonus is implied. No answers leave browser memory.
