#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPS = {"EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "CONTAINS", "AND", "OR", "NOT", "ANY", "EXISTS", "MISSING"}

def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))

def walk(node):
    assert node["op"] in OPS, f"unsupported predicate op: {node['op']}"
    for child in node.get("args", []): walk(child)
    if "predicate" in node: walk(node["predicate"])

manifest = load("data/runtime-manifest.json")
rules = load(manifest["bank_rules"]["path"])
predicates = load(manifest["bank_rule_predicates"]["path"])
timing = load(manifest["offer_timing"]["path"])
assert set(rules) == set(predicates), "rule definition/predicate IDs differ"
assert len(rules) == 18, "Phase 1 must contain the 18 active rule IDs"
for rule_id, rule in rules.items():
    assert rule["rule_id"] == rule_id
    assert rule["dimension"] in {"APPLICATION", "BONUS"}
    assert rule["hard_behavior"] in {"NONE", "WAIT", "BLOCK"}
    walk(predicates[rule_id]["trigger"])
seen = set()
for product_id, record in timing.items():
    assert record["product_id"] == product_id
    assert record["offer_timing_id"] not in seen, "duplicate timing mapping"
    seen.add(record["offer_timing_id"])
    current, result = record["current_offer"], record["timing_result"]
    assert isinstance(current["comparable_value"], (int, float))
    assert current["comparison_unit"]
    assert result["rating"] in {"史高", "较高", "一般", "较低", "无法判断"}
    assert result["wait"] in {"建议等待", "不建议等待", "无法判断"}
assert len(timing) == 6
print(json.dumps({"runtime_files": 4, "rules": len(rules), "products": len(timing), "status": "PASS"}, ensure_ascii=False))
