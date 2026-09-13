# Phase 4 — Official Source → Runtime Publication Pipeline

NextBonus Assessment runtime is data-driven, but the browser must never read Excel files or Google Drive directly. Phase 4 defines a deterministic publication boundary from reviewed source workbooks to committed runtime JSON.

## Runtime publication flow

```text
reviewed XLSX sources
        ↓
scripts/build_runtime_data.py
        ↓
source hash verification
        ↓
deterministic exporters
        ↓
data/*.json
        ↓
scripts/validate_runtime_data.py
        ↓
Regression / targeted tests
        ↓
PR → review → merge
```

All GitHub writes should be performed on a feature/fix branch and merged through a PR. `main` is the merge target, not an editing branch.

## Reviewed workbook sources

Source file names and known Drive metadata are registered in `config/runtime-source-registry.json`. Exact reviewed source SHA256 values are frozen in `data/source-lock.json`.

The current source set is:

- `Bank Rules.xlsx`
- `Offer Timing.xlsx`
- `Approval Engine.xlsx`
- `Long-term Holding Value.xlsx`
- `Assessment Orchestrator.xlsx`
- `Full Report Template Registry V1.xlsx`

The active Google Drive ID for `Full Report Template Registry V1.xlsx` has not been verified through the connector, so the registry records it as a reviewed local XLSX with `drive_id: null`. Do not infer an ID.

## Build command

The source directory must contain the exact reviewed workbook bytes referenced by the source lock.

```bash
python scripts/build_runtime_data.py --source-dir /path/to/reviewed/sources --check
```

`--check` is the default publication check. It regenerates the eight workbook-backed runtime artifacts in a temporary directory and requires them to be byte-identical to the committed runtime:

- `data/bank-rules.json`
- `data/offer-timing.json`
- `data/offer-history.json`
- `data/offer-history-validation.json`
- `data/approval-config.json`
- `data/long-term.json`
- `data/orchestrator.json`
- `data/report-templates.json`

To intentionally publish a reviewed source change on a feature branch:

1. Review the source workbook change.
2. Update that source's SHA256/snapshot in `data/source-lock.json`.
3. Run:

```bash
python scripts/build_runtime_data.py --source-dir /path/to/reviewed/sources --write
```

`--write` replaces generated runtime artifacts and refreshes their Git-blob hashes in the source lock and runtime manifest. It does **not** silently accept a new source SHA256.

## Repo-authored runtime contracts

The following are intentionally reviewed code/data contracts rather than generated from Excel natural language:

- `data/bank-rule-predicates.json`
- `data/products.json`
- `data/questions.json`
- `data/fact-mapping.json`

Their Git-blob hashes are also locked in `data/source-lock.json` so an intentional edit must be visible in a PR.

## CI behavior

PR CI runs `scripts/validate_runtime_data.py` before the Assessment regressions. It verifies:

- manifest paths and Git-blob hashes;
- source-lock integrity;
- 18 Bank Rule definitions/predicates;
- six-card product alignment across Products / Timing / Long-term / Questions / Fact Mapping;
- product issuer and Offer Timing routing;
- Orchestrator final-state template + CTA coverage;
- Offer History source hash provenance;
- deployed Fact Normalizer version metadata.

CI then runs the existing 384-case regression and AMEX empty-history targeted test.

## Important limitation

GitHub CI does not currently have credentials to download the private Google Drive XLSX sources. Therefore CI can prove that the **committed runtime publication is internally consistent and traceable to the reviewed source hashes**, but it cannot independently detect that a Drive workbook changed after the source lock was published.

The offline `build_runtime_data.py --check` step is what compares the actual reviewed workbook bytes to the lock and regenerates the JSON. A future secured CI source-fetch step can close that final gap if desired; no Drive credentials or secrets are introduced in Phase 4.
