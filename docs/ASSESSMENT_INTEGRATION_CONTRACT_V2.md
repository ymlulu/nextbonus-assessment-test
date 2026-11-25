# Assessment local integration contract v2

The current independent project publishes only the v2 entry points. No Discover integration is performed in this phase.

## Local JS

Create the client with `NextBonusAssessmentV2.createClient({rulebook,factbook,products,approval,identityIndex})`.
- `getVersion()`, `listCards()`
- `plan({product_id,known_facts,offer_variant,offer_facts,offer_rule_overrides})`: dynamic editable/pending question schema and evaluation
- `evaluate(sameRequest)`: plan result plus full report; report contains the exact engine decision, application/bonus dimensions, evidence, missing facts and rulebook release.
- `reportFromPlan(planResult)`: consumes a matching-version result without evaluating facts again.
- `getOfferHistory({product_id,offerHistory,evaluation_date})`, `getOfferTiming({product_id,offerTiming})`: optional reviewed historical snapshots; missing source => null.

Question values/IDs come from the fact definitions, not from labels. `known_facts` stays on the device. The UI renders the result, never evaluates bank terms. Standard and NLL are modeled scenarios unless explicit frozen clauses are provided. Unsupported identities yield no questionnaire/report, not an assumed approval. An exact offer with a numeric cap supplies offer_facts.rule_clause_state and offer_facts.rule_limits keyed by the clause ID. Missing or invalid threshold => REVIEW, no question. A reviewed absence of additional product terms may resolve a coverage check via offer_facts.coverage_state[id] = CONFIRMED_NO_ADDITIONAL_RULES; these checks have no impact and never ask user facts.

Overall decision priority: BLOCK, WAIT, REVIEW if facts/clauses incomplete, RISK (soft restriction or high base risk), CLEAR. CLEAR means no modeled limitation found, not approval or guaranteed bonus. No live offer/timing or long-term benefit decision is invented.

## Browser bridge

`bridge.html` uses `nextbonus-assessment-v2`. Allowed-origin window messages: {channel,request_id,method,params}. For plan/evaluate, params may contain request. Response: {channel,request_id,ok,result} or error. The bridge delegates to the same local client. It makes only fixed static-data GETs and returns results to the originating window. No HTTP evaluation endpoint.

The old v1 contract remains a frozen regression baseline in git, no longer part of Pages publication. A v1 client must not send its fixed Q5/Q6 answers to v2; migration is a separate future task. Discover remains unchanged.
