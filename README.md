# NextBonus Assessment Test

## Current assessment (AMEX + Chase)

[Open the dynamic questionnaire](https://ymlulu.github.io/nextbonus-assessment-test/dynamic-questionnaire.html).

All current eligibility rules, questions derived from them, thresholds and impacts use the single [bank-rules library](bank-rules/README.md). The one generic engine is `engines/bank-rules-runtime.js`. The UI renders its question schema, collects facts and displays the returned decision. No answers are uploaded.

- 63 selectable AMEX and Chase identities and 63 executable rules at this release.
- Card identities come from `data/card-identity-index.json`. Explicit canonical mappings and currently unlisted target scopes live in `bank-rules/products.json`.
- Other issuers are not supported yet. Unlisted targets are not selectable products.
- Standard / NLL are modeled offer scenarios, not verification of live terms. Frozen clauses can be supplied explicitly; unknown terms remain unresolved.
- [Audit and open business questions](bank-rules/AUDIT.md).
- The earlier dynamic questionnaire prototype, issuer-specific engines and duplicate policy/index/matrix files are retired. Git history preserves them.

## Current full report and browser integration

The home page opens the current questionnaire. Both the page and the version-2 local bridge (`bridge.html`, channel `nextbonus-assessment-v2`) use `adapters/assessment-api-v2.js` and the same runtime. The full report directly consumes the returned decision and the application/bonus dimensions. No second eligibility computation. See [v2 contract](docs/ASSESSMENT_INTEGRATION_CONTRACT_V2.md).

Reviewed reward history is loaded only on demand and shown as dated historical evidence, not a current offer. Long-term benefit valuation is outside the current application/bonus assessment scope.

## Frozen compatibility baseline — NOT the current rulebook

`legacy/index-v1.html` and `legacy/bridge-v1.html` retain the frozen v1 full-report/integration contract for repository-only tests. The live Pages build now publishes only the current v2 assets. The older bank rule export, fixed questionnaire, benefit valuation, offer history, rendering and manifest remain for compatibility. Do not edit that baseline to change the new questionnaire. Discover has its own copy of the old runtime; migrate that consumer separately only after the independent project is finished. See [v1 integration contract](docs/ASSESSMENT_INTEGRATION_CONTRACT_V1.md) and [offer history](OFFER_HISTORY.md). The current dynamic questionnaire does not load the compatibility baseline or calculate benefits.

## Development

Current runtime tests: `node tests/bank-rules-contract.cjs`, `node tests/bank-rules-runtime.cjs`, `node tests/bank-rules-audit.cjs`, `node tests/dynamic-questionnaire-browser-startup.cjs`. Remaining Phase 1–6 regression suites validate the compatibility baseline. Changes to business rules require independent acceptance cases as well as valid executable data. Full CI must pass before merge. Pages publishes merged main.

This is a public local-computation test site, not a bank decision or remote evaluation API.
