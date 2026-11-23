# Dynamic questionnaire prototype · standalone API contract v1

This is an **isolated prototype in nextbonus-assessment-test**, not Discover application code. Open `dynamic-questionnaire.html` (or its GitHub Pages URL) to try the questionnaire planner without changing the existing Assessment QA page.

## Ownership and safety

- Assessment owns its 129-rule **question-routing index** and F01–F12 fact registry. Source: the reviewed `Bank Rules.xlsx` snapshot dated 2026-09-12, staged as `data/dynamic-questionnaire-rule-index.json`.
- The index is an **advisory questionnaire-planning layer**; it does not replace the reviewed, source-locked 19-rule executable runtime. Do not silently promote uncompiled source rules into eligibility decisions.
- The existing seven reviewed products come from this repository's `data/products.json`, not from Discover.
- Long-term benefit Q7/Q8 is excluded; a card does not require a benefits record to preview application questions.
- Rule applicability is an exact, deterministic match. Supported source predicates are explicit equality AND clauses and exact reviewed `product_name IN {...}` sets. Unknown/unmapped target predicates remain unresolved; no fuzzy names, eval, or AI inference.
- Offer-dependent restrictions are only activated when a structured **frozen** offer gate is explicitly confirmed. Missing or complex/uncompiled gates are a **system knowledge gap**, never a user question or a guessed PASS.
- `REFERENCE_ONLY`, `INACTIVE` and non-question meta rules never create questions.
- Question fact groups are deduplicated across applicable rules; facts already available from a caller-owned local profile/session are skipped. F06 AU detail is requested only when a known F01 numeric 24-month count reaches the Chase decision boundary.
- No login, storage or network submission of answers exists. The pure planner module does not call fetch, localStorage or external endpoints. The demo fetches **only static public rule and product JSON**, and holds answers in page memory.

## API-like boundary (client-side, no network POST)

`adapters/dynamic-questionnaire-v1.js` exposes `NextBonusQuestionnairePlannerV1.makePlanner({ruleIndex,products,baseQuestions,frozenOfferFacts})`. The returned service supports:

```js
const version = planner.getVersion();
const products = planner.listProducts();
const plan = planner.getQuestionnaire({
  product_id: 'chase_sapphire_preferred',
  known_facts: { a1: 'Y2_PLUS', F01_RECENT_NEW_ACCOUNTS: 5 }
});
```

The versioned result includes `contract_version`, `release_id`, `questionnaire.common`, `questionnaire.specific`, `questionnaire.benefits: null`, and diagnostics (rule IDs and knowledge gaps). It deliberately returns `evaluation_ready: false`. Personal answers are **not** echoed back.

Future Discover integration should be a thin client for this versioned contract; the domain knowledge and engine stay in Assessment. Privacy-preserving distribution options include shipping a reviewed local engine/data snapshot with the app and running it on-device, or serving immutable versioned assets via a separate static endpoint and running them locally. **Do not POST user answers to a remote evaluation API** if the local-only privacy promise is to be retained.

## Scope limitations of this trial

This is **not** a complete 129-rule execution engine. Of the reviewed 129 rows, 89 are classed executable restrictions, 21 meta, 15 reference-only, 4 inactive. The prototype indexes all rows, conservatively routes supported conditions, and drafts questions only for the rules with verified target + gate. It does not yet compile every source rule's predicates or the cross-issuer special matrix.

The current Approval Engine still uses its existing A1–A4 model. An independent HP-sensitivity scoring channel is future work, not silently inferred from A4 applications. A future product expansion needs reviewed product metadata, exact offer terms and full decision validation.

## Test and release

Run `node tests/dynamic-questionnaire-v1.cjs`. PR CI runs this alongside the existing frozen-runtime regression suite. Source changes to reviewed datasets require the existing source-lock publication workflow. Merge only after CI passes.

## 2026-11-23 — Name or URL input and 98-card lookup

The isolated card identity service is in `adapters/card-identity-v1.js`. It uses a compact audited-source-derived index (`data/card-identity-index.json`) of **98 distinct historical offer identities**, of which 7 are reviewed runtime products, 13 are expansion candidates and 78 have offer-history identity only. Historical identity **never proves** a currently issued card, live offer, application terms or actual credit approval.

`adapters/card-questionnaire-facade-v1.js` wraps identity resolution and the existing local planner:

```js
const identity = NextBonusCardIdentityV1.createLookup(cardIdentityIndex);
const planner = NextBonusQuestionnairePlannerV1.makePlanner({
  ruleIndex, products, baseQuestions: questions.common, frozenOfferFacts
});
const client = NextBonusQuestionnaireFacadeV1.createFacade({lookup:identity,planner});
client.search({input:'Chase Freedom Unlimited'});
client.plan({input:'Chase Freedom Unlimited',known_facts:{}});
client.plan({input:'A new unindexed card',issuer:'CHASE',customer_type:'PERSONAL'});
```

- Exact, unique card names and locally reviewed URLs resolve to a catalog identity. Generic names (e.g. `Gold`) and third-party URL slugs require the user to **confirm** the suggested identity.
- Unknown cards can preview the universal questions and safely matched issuer-level rules **only when the user explicitly supplies issuer and personal/business type**. They do not inherit made-up product names, card-family metadata, or current offer facts.
- Missing product metadata, unknown rule target expressions and unknown system gates are reported as knowledge gaps, not treated as an eligibility PASS.
- When an identity comes only from history/expansion, the questionnaire remains `evaluation_ready: false`; no new products are silently activated in the reviewed seven-product decision engine.
- No live web scraping or external link fetching occurs in the identity library. If the exact card isn't available, user confirmation or a separate reviewed product-metadata source is still required.
- `dynamic-questionnaire.html` allows names or URLs, optional issuer/type clarification, and explicit candidate selection. Only static JSON assets are fetched. Personal answers are stored in page memory and never uploaded.

This is a **local function API**, not an HTTP endpoint. Existing `/assessment/v1/...` routes are still future transport design, and remote answer evaluation is incompatible with the current promise that answers/results stay on-device.

Regression test: `node tests/card-name-to-questionnaire-v1.cjs`.
