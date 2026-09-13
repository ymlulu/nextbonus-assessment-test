# Phase 2 data-driven migration

Phase 2 moves Approval, Long-term Holding Value, Orchestrator state selection, and Full Report copy/templates out of the active evaluation path in `index.html` and into versioned runtime contracts.

## Runtime contracts

- `data/approval-config.json` — Approval base matrix, issuer sensitivity, recent-activity adjustment, Bilt overlay mapping, reason-code mapping.
- `data/long-term.json` — six-card annual fees, Q7 annualized values, Q8 benefits, scoring bands and override.
- `data/orchestrator.json` — formal source priority plus machine-readable runtime priority and enum bridges.
- `data/report-templates.json` — final summaries, application/bonus clear copy, approval reasons/templates, launch-rule report templates, offer display copy, long-term copy and CTA mapping.

## Engines

- `engines/approval-engine.js`
- `engines/long-term-engine.js`
- `engines/orchestrator-engine.js`
- `engines/report-renderer.js`
- `engines/assessment-runtime-engine.js`

The runtime loader loads all contracts first, loads the engines, lets the existing page initialize, then replaces `NBEngine.evaluate` with the Phase 2 runtime evaluator. The old inline evaluator remains temporarily as a regression baseline/fallback implementation but is no longer the active evaluation path after runtime initialization.

## Sources

- Approval Engine.xlsx — FINAL, snapshot 2026-09-12.
- Long-term Holding Value.xlsx — FINAL, snapshot 2026-09-11.
- Assessment Orchestrator.xlsx — FINAL, snapshot 2026-09-12.
- Full Report Template Registry V1.xlsx — V1 launch-card deterministic report contract.

No browser runtime reads Excel, Google Drive, web search or AI.

## Compatibility extensions

The formal Orchestrator distinguishes system-side `WAIT_SYSTEM_RULE`. The deployed Assessment also has the user-approved nonblocking `WAIT_INFORMATION` behavior: unanswered decisive user facts still produce a Full Report and are explained inside it rather than stopping to ask more questions. Phase 2 preserves that deployed behavior as an explicit runtime extension.

Three already-published report strings differ slightly from the Registry reference wording. Phase 2 preserves the currently deployed strings so this architecture migration does not silently change user-facing copy. These overrides are listed in `report-templates.json` and can be reconciled in a separate copy-only change.

## Regression

Before publishing this branch, the new runtime engines were compared against the pre-Phase-2 evaluation path across the existing 384-case matrix: 384/384 identical, 0 differences. `tests/phase2-regression.cjs` keeps the same shadow comparison inside the repository.

## Remaining hardcode

Phase 2 intentionally leaves questionnaire definitions, product/article/application metadata, UI rendering, and the question-to-fact normalizer in the page. These are candidates for the next migration phase. The old Approval/Long-term/Orchestrator/report functions also remain temporarily in `index.html` as the shadow baseline, but the active runtime evaluation is provided by `AssessmentRuntimeEngineV2`.
