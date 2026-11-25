# NextBonus Assessment Test

**Current rule-driven questionnaire:** [`dynamic-questionnaire.html`](dynamic-questionnaire.html). Edit only [`bank-rules/`](bank-rules/README.md) for its AMEX/Chase eligibility rules. All predicates, thresholds, scope and impacts are data-driven. The earlier full-report `index.html` / `bridge.html` pipeline and its data are preserved as a legacy integration baseline, not the source for this questionnaire. The descriptions below document those earlier phases.

Standalone test deployment for the NextBonus deterministic Assessment flow.

## What this repo is

- Static single-page test app.
- No GPT/API dependency at runtime.
- Current UI file: `index.html`.
- Active browser bootstrap: `assets/bootstrap-v3.js`.
- Active assessment runtime: `engines/assessment-runtime-engine-v3.js`.
- Intended only for isolated QA before integration into the main NextBonus app.

## Source contract boundary

The runtime must not silently invent or override reviewed business facts.

- Google Drive reviewed workbooks are the formal source layer for Bank Rules, Offer Timing, Approval, Long-term, Orchestrator and Full Report Registry.
- The six reviewed Google Drive Assessment question documents are the formal user-visible question specification. `data/questions.json` is their reviewed runtime mirror.
- `data/products.json`, `data/fact-mapping.json` and `data/bank-rule-predicates.json` are currently explicit GitHub machine contracts. They remain temporary machine-side authorities until the Phase 5B canonical product metadata / typed-fact / applicability cleanup is complete.
- `config/source-contract-registry.json` records these authority assignments and the six current question-document Drive IDs/revisions.
- `config/runtime-source-registry.json` and `data/source-lock.json` register and freeze workbook provenance.

The active six-card runtime behavior is unchanged by Phase 5 PR A. This phase only cleans source metadata, authority documentation, legacy paths and CI coverage.

## Dynamic questionnaire (standalone prototype)

Open [the separate local-only questionnaire preview](dynamic-questionnaire.html). It routes the reviewed 129-rule index to deduplicated questions without including long-term benefits, scoring decisions, Discover code or answer uploads. Details and safety limits: [Dynamic Questionnaire API v1](docs/DYNAMIC_QUESTIONNAIRE_PROTOTYPE_V1.md).

## Enter any card name or URL (independent beta)

The [dynamic questionnaire QA page](dynamic-questionnaire.html) now accepts a card name or URL. Its identity search covers 98 distinct cards from the **independent Assessment** offer-history index, including seven reviewed products; additional cards still require exact confirmation or minimal issuer and customer-type input. It does not scrape external URLs or claim a current offer is verified. For unknown cards, it can show common questions and issuer-level questions, with product-specific rules left unresolved.

All matching and questionnaire generation stays on-device in the browser. Answers never leave the page. This is **not** a remote HTTP scoring API, not the full 129-rule executable evaluator, and not wired into Discover. See [scope and limitations](docs/DYNAMIC_QUESTIONNAIRE_PROTOTYPE_V1.md).

## AMEX catalog questionnaire coverage

The independent card identity index now includes **32 American Express cards** from the reviewed NextBonus formal card catalog, plus a separately sourced Schwab Platinum variant. The independent catalog has 109 total identities. Amex questionnaire routing recognizes exact product/family scope, revolving vs charge card forms, and the 31 reviewed AMEX Bank Rules. An unconfirmed offer clause stays a visible *system knowledge gap* rather than a guessed eligibility restriction. See [AMEX catalog coverage](docs/AMEX_CATALOG_COVERAGE.md) for provenance, privacy and limitations. The independent assessment remains questionnaire-only; no changes to Discover.

Amex question previews now assume the **standard public offer** by default, with explicit `NLL` and rule-level exceptions; no live offer verification or approval decision is implied. See [Amex offer variants](docs/AMEX_CATALOG_COVERAGE.md#standard-offer-default-and-explicit-nll-variants).

## Deploy with GitHub Pages

1. Push changes on a feature/fix branch.
2. Open a pull request targeting `main`.
3. Require the repository CI checks to pass.
4. Merge only after CI is green.
5. GitHub Pages publishes from the merged `main` branch.

Direct edits to `main` are not part of the supported workflow.

## Current test behavior

- Assessment completion goes directly to Full Report.
- Unknown/blank answers do not block report generation.
- Unknown Bank Rule facts are explained inside the report instead of forcing extra questions.
- Unknown approval inputs render approval as `无法判断`.
- Unknown long-term inputs render long-term value as `无法判断`.
- Hard WAIT/BLOCK rules still take priority when known.
- Offer Detail summary remains separate from the Full Report.

## Historical offer chart

Full Report adds a native SVG history chart below the current-offer text. The chart reads a checked-in static JSON export; it never recalculates Assessment decisions. See [OFFER_HISTORY.md](OFFER_HISTORY.md) for mapping, filters, source issues, tests and the reviewed update process.

Open the [test website](https://ymlulu.github.io/nextbonus-assessment-test/) to use the chart. Offline direct-file use retains the text-only Assessment if static JSON cannot load.

## Legacy files

The old V2 loader and V2 assessment runtime implementation are archived under `legacy/`. Their former active paths contain non-executing migration stubs only. The production test page does not load those paths.

## Important

This repository contains client-side test logic. If the GitHub Pages site is publicly accessible, the HTML/JS and embedded rule logic are also publicly inspectable. Use a private repository / restricted Pages visibility if these rules should not be public.
