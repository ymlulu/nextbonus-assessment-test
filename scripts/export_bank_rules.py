#!/usr/bin/env python3
"""Verify available authoring rows and export the reviewed Phase 1 rule contract."""
import argparse, json
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("workbook", type=Path)
parser.add_argument("--output", type=Path, default=ROOT / "data/bank-rules.json")
args = parser.parse_args()
runtime = json.loads((ROOT / "data/bank-rules.json").read_text(encoding="utf-8"))
wb = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
source_ids = set()
for sheet in wb:
    for row in sheet.iter_rows(values_only=True):
        source_ids.update(str(v).strip() for v in row if isinstance(v, str) and str(v).strip() in runtime)
missing = sorted(set(runtime) - source_ids)
args.output.write_text(json.dumps(runtime, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"rules": len(runtime), "verified_source_rows": len(source_ids), "source_gaps": missing, "output": str(args.output)}, ensure_ascii=False))
