# Phase 5 PR A — Source Contract Cleanup

Phase 5 PR A cleans the boundary between reviewed business sources and the committed runtime without changing the current six-card Assessment decisions.

## Scope

This PR is intentionally limited to source consistency, provenance, active/legacy path cleanup and CI coverage. It does not implement typed answer values, canonical product applicability, Frozen Current Offer Facts, Offer/System Gates, renderer policy extraction, exporter business-policy extraction, or result provenance snapshots. Those belong to later Phase 5 PRs.

## Verified source fixes

### Full Report Template Registry

`Full Report Template Registry V1.xlsx` is now verified as an official Google Drive source.

- Drive ID: `1JCZbg94yL2Wf6vIby8BiThFfSIkN7jIt`
- Drive modified time: `2026-09-13T12:15:27.447Z`
- SHA256: `6182a0ce167d532b2df21fa0b9750b2717555cbe698c02bb2274abbd4cf70a5a`

The downloaded Drive workbook bytes match the SHA256 that was already frozen in `data/source-lock.json`, so this is a metadata/provenance correction only. No Full Report runtime data changes are required.

### Chase Sapphire Preferred Q6C

The reviewed Drive document `Assessment 问卷｜Chase Sapphire Preferred` now includes Q6C asking whether the user currently holds an open Chase Sapphire Preferred. `data/questions.json` already contains the same required input. PR A therefore records and validates the aligned source revision rather than changing the current runtime behavior.

## Source authority contract

`config/source-contract-registry.json` makes the current authority boundary explicit.

| Contract | Current authority | Runtime role |
| --- | --- | --- |
| Questions | Reviewed Google Drive question documents | `data/questions.json` is a reviewed runtime mirror |
| Products | GitHub machine contract | `data/products.json` |
| Fact Mapping | GitHub machine contract | `data/fact-mapping.json` |
| Bank Rule Predicates | GitHub machine contract | `data/bank-rule-predicates.json` |

The latter three remain explicit machine-side contracts until Phase 5B moves product metadata, typed facts and Bank Rule applicability toward the final canonical model. PR A does not pretend that those contracts already have a Drive-generated source path.

For Questions, the registry freezes the six current Drive document IDs and revisions. Runtime validation requires the question-source product IDs to exactly match the active product IDs and verifies that CSP Q6C remains present in the runtime mirror.

## Active runtime and legacy files

The active browser path is:

```text
index.html
  → assets/bootstrap-v3.js
  → engines/assessment-runtime-engine-v3.js
```

The old V2 loader and V2 assessment runtime implementation are archived under:

- `legacy/runtime-loader-v2.js`
- `legacy/assessment-runtime-engine-v2.js`

Their former active paths now contain non-executing migration stubs. Existing regression tests that need the historical V2 baseline explicitly load the archived implementation from `legacy/`.

## CI changes

PR CI continues to run runtime validation, active-product readiness, deterministic product smoke tests, Phase 2→3 regression, and the AMEX empty-history test. PR A additionally runs the existing Bank Rule key-case suite so explicit rule routing cases are protected on every PR.

The validator now also checks:

- workbook `source_kind` as well as filename/snapshot/hash metadata;
- the verified Full Report Drive source registration;
- the source-contract registry lock;
- six question source IDs/revisions against the active product set;
- Questions vs GitHub machine-contract authority assignments;
- CSP Q6C runtime presence;
- V3 active entry points and V2 legacy archive paths.

## Explicitly deferred to Phase 5B / 5C

The following audit findings are intentionally not solved in PR A because they can affect execution semantics and deserve isolated review:

- typed `{value, label}` answers and removal of Chinese-label parsing;
- canonical product metadata for issuer / product type / customer type / card form / brand / generation / exact product;
- Frozen Current Offer Facts and Offer/System Gate evaluation in Bank Rule applicability;
- real `KNOWLEDGE_GAP` propagation;
- Offer Timing generation from the formal workbook rather than validation of a reviewed runtime snapshot;
- formal Orchestrator source support for `WAIT_INFORMATION`;
- removal of business policy from Renderer and exporter code;
- Assessment Result provenance snapshot including release ID, hashes, engine versions and frozen evaluation date;
- complete engine-version provenance enforcement;
- deeper Drive QA workbook integration.

## Release rule

All changes follow feature branch → PR → CI → merge. `main` remains a merge target and is not edited directly.
