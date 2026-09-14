# NextBonus Assessment Integration Contract v1

## 1. Purpose

Assessment is an independently developed deterministic domain service. NextBonus owns application UI, authentication, user persistence and Assessment session history. Assessment owns questionnaire definitions, fact normalization, Bank Rules, Approval, Offer Timing, Long-term evaluation, orchestration and report wording.

The integration boundary is versioned. NextBonus must not import or reimplement Assessment business rules.

## 2. Architecture boundary

```text
Google Drive reviewed sources
        ↓
Assessment runtime publication
        ↓
Assessment Core (pure evaluation boundary)
        ↓
├─ Browser adapter → standalone QA page
└─ API adapter     → NextBonus / other clients
```

`engines/assessment-core-v1.js` is environment-neutral. It does not read DOM, `window`, localStorage, network resources or user identity. Runtime data and component engines are explicit inputs.

`engines/assessment-runtime-engine-v3.js` is the compatibility browser adapter. Existing QA UI continues to call `AssessmentRuntimeEngineV3.evaluate()`.

`adapters/assessment-api-v1.js` defines the future stateless API boundary. It can be hosted by Cloudflare Workers or another server runtime without moving business rules into NextBonus.

## 3. Stable HTTP surface

The production transport is not deployed by Phase 6.1. When deployed, the intended v1 routes are:

- `GET /assessment/v1/version`
- `GET /assessment/v1/products/{product_id}/assessment?locale=zh-CN`
- `POST /assessment/v1/assessments/evaluate`

Transport code should delegate to the API adapter and must not contain decision logic.

## 4. Questionnaire response

`GET /products/{product_id}/assessment` returns:

- `contract_version`
- `release_id`
- `locale`
- stable product metadata
- `questionnaire.common`
- `questionnaire.specific`
- `questionnaire.benefits.q7`
- `questionnaire.benefits.q8`

Question IDs and option `value` fields are machine contracts. Labels are display text. NextBonus should store and submit option values, never infer rules from labels.

The client should render supported question types from schema (`single`, `multi`, `group`) and honor schema controls such as `show_when`, `system_gate`, `exclusive`, `number_when` and `number_id`.

## 5. Evaluate request

Example:

```json
{
  "product_id": "chase_sapphire_reserve",
  "evaluation_date": "2026-09-14",
  "locale": "zh-CN",
  "answers": {
    "a1": "Y2_PLUS",
    "a2": "SCORE_740_PLUS",
    "a3": "N0",
    "a4": "N0",
    "Q5A": "N0_3",
    "Q5B": "NO",
    "Q6A": "N0",
    "Q6B": "NEVER",
    "Q6C": "NO",
    "q7": ["CSR_Q7_TRAVEL"],
    "q8": ["CSR_Q8_REWARDS"]
  }
}
```

`evaluation_date` is required and frozen per Assessment session. Assessment does not silently substitute server time.

`answers` is flat at the integration boundary. The adapter maps stable question IDs to the internal runtime shape. NextBonus must not know internal fact names or Bank Rule predicates.

## 6. Evaluate response

The stable v1 response contains:

- `contract_version`
- `release_id`
- `locale`
- `evaluation_date`
- `product_id`, `product_name`
- `decision`
  - `internal_state`
  - `recommended_action`
  - `summary`
- `dimensions`
  - `application`
  - `bonus`
  - `offer`
  - `long_term`
- `report`
  - application / bonus / offer / approval / long-term text
  - CTA
- optional `offer_history`
  - `offer_timing_id`
  - source snapshot
  - current comparable offer
  - reviewed historical offer points safe for display
- `provenance`
  - Assessment release
  - evaluation date
  - engine versions
  - runtime contract blobs
  - source lock

`offer_history` is display data owned by Assessment. It is filtered to the same reviewed comparison unit, confidence and eligibility rules used by the standalone historical-offer chart. NextBonus may render this payload, but must not independently recalculate the Offer Timing rating or infer a new recommendation from the chart.

The API intentionally does not expose normalized facts or rule predicates as required client inputs. Those remain Assessment implementation details.

## 7. Versioning rules

`contract_version` changes only for breaking integration changes.

A new Assessment `release_id` is not a breaking API change. Bank Rule updates, Offer Timing updates, newly reviewed products, wording updates and engine bug fixes may ship under contract v1 as long as the v1 shape and semantics remain compatible.

Adding optional response fields is compatible. Removing or renaming v1 fields, changing stable question IDs, or changing the meaning of an existing option value requires explicit migration planning and normally a new contract version.

## 8. Persistence boundary

Assessment is stateless. It does not own `user_id`, login state, Watchlist, Product ownership or historical sessions.

NextBonus should persist an Assessment session snapshot containing at least:

- `assessment_id`
- `user_id`
- `product_id`
- optional `offer_id`
- submitted `answers`
- `contract_version`
- `assessment_release_id`
- `evaluation_date`
- full `result_snapshot`
- timestamps

Historical results must not be silently recalculated after Assessment rules change. A user-triggered refresh creates or records a new evaluation using the then-current release.

## 9. Client rule

NextBonus should have one thin `AssessmentClient` boundary with methods equivalent to:

```text
getVersion()
getQuestionnaire(productId, locale)
evaluate(request)
```

No NextBonus page should import Bank Rule, Approval, Long-term, Orchestrator or report-renderer modules directly. No client code should duplicate decision rules. Historical-offer rendering must consume `offer_history` from the Assessment response rather than reading Assessment runtime data directly.

## 10. Phase 6.1 acceptance

Phase 6.1 is complete only when:

1. the standalone browser QA page still produces the same deterministic business outputs;
2. Assessment Core can run without browser globals;
3. API v1 adapter can return questionnaire/version/evaluation shapes from the same runtime release;
4. CI covers the integration contract;
5. no server deployment is required yet.
