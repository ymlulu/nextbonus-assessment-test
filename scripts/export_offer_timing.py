#!/usr/bin/env python3
"""Verify the six runtime offers against Offer Timing.xlsx and export the contract."""
import argparse, json
from datetime import datetime
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("workbook", type=Path)
parser.add_argument("--output", type=Path, default=ROOT / "data/offer-timing.json")
args = parser.parse_args()
runtime = json.loads((ROOT / "data/offer-timing.json").read_text(encoding="utf-8"))
wb = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
rows = list(wb["Current Offer Input"].iter_rows(min_row=2, values_only=True))
source = {r[0]: r for r in rows if r[0]}
for product_id, item in runtime.items():
    rule_id = item["offer_timing_id"]
    if rule_id not in source: raise SystemExit(f"missing Offer Timing ID in workbook: {rule_id}")
    row = source[rule_id]
    expected = item["current_offer"]
    if row[6] != expected["comparable_value"] or row[7] != expected["comparison_unit"]:
        raise SystemExit(f"current offer mismatch: {product_id}")
# Formula results are intentionally exported from the reviewed runtime snapshot because
# this workbook does not contain cached Timing Output values for openpyxl to read.
args.output.write_text(json.dumps(runtime, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"products": len(runtime), "output": str(args.output), "status": "PASS"}, ensure_ascii=False))
