#!/usr/bin/env python3
"""Validate and export the Phase 1 runtime Bank Rule contract from Bank Rules.xlsx.

Executable effects (dimension, numeric impact, hard resolution) come from the official
Rule Database. Applicability presence/audit status is verified from Rule Applicability.
Machine predicates remain an explicit reviewed JSON mapping and are never inferred from
Scope, Condition / Trigger, Evaluation Logic, or other natural-language workbook fields.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import openpyxl

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def find_header_row(ws, required_headers: list[str], max_scan: int = 12):
    required = set(required_headers)
    for row_idx in range(1, min(ws.max_row or 0, max_scan) + 1):
        values = [c.value for c in ws[row_idx]]
        if required.issubset(set(values)):
            return row_idx, {v: i for i, v in enumerate(values) if v is not None}
    raise ValueError(f"could not find required headers in sheet {ws.title}: {sorted(required)}")


def to_impact(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"invalid numeric {label}: {value!r}")
    try:
        n = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid numeric {label}: {value!r}") from exc
    if n not in {0, 1, 2, 3}:
        raise ValueError(f"out-of-range {label}: {n}")
    return n


def indexed_rows(ws, header_row: int, headers: dict[str, int]) -> dict[str, tuple]:
    out: dict[str, tuple] = {}
    duplicates: list[str] = []
    for values in ws.iter_rows(min_row=header_row + 1, values_only=True):
        rid = values[headers["Rule ID"]]
        if not rid:
            continue
        rid = str(rid).strip()
        if rid in out:
            duplicates.append(rid)
        out[rid] = values
    if duplicates:
        raise ValueError(f"duplicate Rule IDs in {ws.title}: {sorted(set(duplicates))}")
    return out


def export_contract(workbook: Path, predicates_path: Path, current_runtime_path: Path):
    predicates = load_json(predicates_path)
    current = load_json(current_runtime_path)
    rule_ids = list(predicates)
    if not rule_ids:
        raise ValueError("predicate mapping contains no Rule IDs")
    if set(current) != set(rule_ids):
        raise ValueError("current bank-rules.json IDs differ from bank-rule-predicates.json IDs")

    # Some production workbooks have stale worksheet dimension metadata; normal mode is
    # reliable and inexpensive for the current workbook size.
    wb = openpyxl.load_workbook(workbook, read_only=False, data_only=True)
    for required_sheet in ("Rule Database", "Rule Applicability"):
        if required_sheet not in wb.sheetnames:
            raise ValueError(f"missing required sheet: {required_sheet}")

    db = wb["Rule Database"]
    db_header, h = find_header_row(
        db,
        [
            "Rule ID",
            "Rule Name",
            "Application Impact",
            "Dimension",
            "Bonus Impact",
            "Status",
            "Hard Resolution Policy",
        ],
    )
    db_rows = indexed_rows(db, db_header, h)

    app = wb["Rule Applicability"]
    app_header, ah = find_header_row(app, ["Rule ID", "Runtime Class", "Audit Status"])
    app_rows = indexed_rows(app, app_header, ah)

    missing_db = sorted(set(rule_ids) - set(db_rows))
    missing_app = sorted(set(rule_ids) - set(app_rows))
    if missing_db or missing_app:
        raise ValueError(
            json.dumps(
                {
                    "missing_rule_database": missing_db,
                    "missing_rule_applicability": missing_app,
                },
                ensure_ascii=False,
            )
        )

    exported: dict[str, dict[str, Any]] = {}
    verified: dict[str, dict[str, Any]] = {}
    for rid in rule_ids:
        row = db_rows[rid]
        arow = app_rows[rid]

        status = str(row[h["Status"]] or "").strip().upper()
        if status != "ACTIVE":
            raise ValueError(f"{rid}: expected ACTIVE status, got {status or '<blank>'}")

        audit = str(arow[ah["Audit Status"]] or "").strip().upper()
        if audit != "PASS":
            raise ValueError(f"{rid}: Rule Applicability audit status is {audit or '<blank>'}, expected PASS")

        runtime_class = str(arow[ah["Runtime Class"]] or "").strip().upper()
        if runtime_class not in {"EXECUTABLE_RULE", "EXECUTABLE_META"}:
            raise ValueError(f"{rid}: unsupported Runtime Class {runtime_class or '<blank>'}")

        dimension = str(row[h["Dimension"]] or "").strip().upper()
        app_impact = to_impact(row[h["Application Impact"]], f"{rid} Application Impact")
        bonus_impact = to_impact(row[h["Bonus Impact"]], f"{rid} Bonus Impact")
        if dimension == "APPLICATION":
            impact, other = app_impact, bonus_impact
        elif dimension == "BONUS":
            impact, other = bonus_impact, app_impact
        else:
            raise ValueError(f"{rid}: unsupported Dimension {dimension or '<blank>'}")
        if other != 0:
            raise ValueError(f"{rid}: non-primary impact must be 0 in Phase 1, got {other}")

        hard = str(row[h["Hard Resolution Policy"]] or "").strip().upper()
        if hard not in {"NONE", "WAIT", "BLOCK"}:
            raise ValueError(f"{rid}: invalid Hard Resolution Policy {hard or '<blank>'}")
        if impact < 3 and hard != "NONE":
            raise ValueError(f"{rid}: soft impact {impact} cannot use hard behavior {hard}")
        if impact == 3 and hard == "NONE":
            raise ValueError(f"{rid}: impact 3 requires WAIT or BLOCK")

        # Keep the stable runtime display label. Executable effect fields come from the
        # workbook and are therefore source-validated on every export.
        stable_name = str(current[rid].get("name") or "").strip()
        if not stable_name:
            stable_name = str(row[h["Rule Name"]] or "").strip()
        if not stable_name:
            raise ValueError(f"{rid}: no runtime or source rule name")

        exported[rid] = {
            "rule_id": rid,
            "name": stable_name,
            "dimension": dimension,
            "impact": impact,
            "hard_behavior": hard,
        }
        verified[rid] = {
            "source_rule_name": str(row[h["Rule Name"]] or "").strip(),
            "runtime_class": runtime_class,
            "status": status,
            "audit_status": audit,
        }

    return exported, verified


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--predicates", type=Path, default=ROOT / "data/bank-rule-predicates.json")
    parser.add_argument("--current-runtime", type=Path, default=ROOT / "data/bank-rules.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data/bank-rules.json")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()

    exported, _verified = export_contract(args.workbook, args.predicates, args.current_runtime)
    changed = exported != load_json(args.current_runtime)
    if not args.check_only:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(exported, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "rules": len(exported),
                "rule_database_verified": len(exported),
                "rule_applicability_verified": len(exported),
                "source_gaps": [],
                "runtime_effect_changes": changed,
                "output": None if args.check_only else str(args.output),
                "status": "PASS",
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
