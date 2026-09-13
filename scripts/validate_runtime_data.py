#!/usr/bin/env python3
"""Static integrity validation for the committed NextBonus runtime publication."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPS = {"EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "CONTAINS", "AND", "OR", "NOT", "ANY", "EXISTS", "MISSING", "ALWAYS"}


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def git_blob_sha(path):
    data = (ROOT / path).read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def walk(node):
    assert node["op"] in OPS, f"unsupported predicate op: {node['op']}"
    for child in node.get("args", []):
        walk(child)
    if "predicate" in node:
        walk(node["predicate"])


manifest = load("data/runtime-manifest.json")
source_lock = load(manifest["source_lock"]["path"])
source_registry = load("config/runtime-source-registry.json")

# Every source registry entry must be intentionally locked to a reviewed source hash.
assert set(source_registry["sources"]) == set(source_lock["sources"]), "source registry/lock keys differ"
for key, meta in source_registry["sources"].items():
    locked = source_lock["sources"][key]
    assert meta["file_name"] == locked["file_name"], f"source filename mismatch: {key}"
    assert str(meta["snapshot"]) == str(locked["snapshot"]), f"source snapshot mismatch: {key}"
    assert re.fullmatch(r"[0-9a-f]{64}", locked["sha256"]), f"invalid source SHA256: {key}"
    if meta.get("drive_id") is not None:
        assert meta["drive_id"] == locked.get("drive_id"), f"Drive ID mismatch: {key}"

# Git-blob hashes make committed runtime provenance reviewable without private Drive access.
for group in ("repo_contracts", "generated_runtime"):
    for key, rec in source_lock[group].items():
        assert (ROOT / rec["path"]).is_file(), f"missing locked file: {rec['path']}"
        assert git_blob_sha(rec["path"]) == rec["git_blob_sha"], f"locked Git blob drift: {key}"
        for source_key in rec.get("source_keys", []):
            assert source_key in source_lock["sources"], f"unknown source key {source_key} for {key}"

# Manifest paths and content hashes must match what the browser is configured to load.
manifest_data_keys = [
    "bank_rules", "bank_rule_predicates", "offer_timing", "offer_history", "offer_history_validation",
    "approval", "long_term", "orchestrator", "report_templates", "products", "questions", "fact_mapping",
]
for key in manifest_data_keys:
    rec = manifest[key]
    assert (ROOT / rec["path"]).is_file(), f"manifest path missing: {key}"
    assert git_blob_sha(rec["path"]) == rec["git_blob_sha"], f"manifest Git blob drift: {key}"

rules = load(manifest["bank_rules"]["path"])
predicates = load(manifest["bank_rule_predicates"]["path"])
timing = load(manifest["offer_timing"]["path"])
products = load(manifest["products"]["path"])
questions = load(manifest["questions"]["path"])
fact_mapping = load(manifest["fact_mapping"]["path"])
approval = load(manifest["approval"]["path"])
long_term = load(manifest["long_term"]["path"])
orchestrator = load(manifest["orchestrator"]["path"])
templates = load(manifest["report_templates"]["path"])
history_validation = load(manifest["offer_history_validation"]["path"])

# Bank Rules contract.
assert set(rules) == set(predicates), "rule definition/predicate IDs differ"
assert len(rules) == 18, "launch runtime must contain the 18 active rule IDs"
for rule_id, rule in rules.items():
    assert rule["rule_id"] == rule_id
    assert rule["dimension"] in {"APPLICATION", "BONUS"}
    assert rule["hard_behavior"] in {"NONE", "WAIT", "BLOCK"}
    walk(predicates[rule_id]["trigger"])

# The six launch products must be routed consistently across all runtime modules.
product_ids = set(products["cards"])
assert len(product_ids) == 6
for name, ids in {
    "timing": set(timing),
    "long_term": set(long_term["cards"]),
    "questions": set(questions["cards"]),
    "fact_mapping": set(fact_mapping["cards"]),
}.items():
    assert ids == product_ids, f"product IDs differ in {name}"

seen_timing_ids = set()
for product_id, product in products["cards"].items():
    assert product["product_id"] == product_id
    assert product["issuer"] in approval["issuer_sensitivity"], f"issuer missing from Approval config: {product_id}"
    record = timing[product_id]
    assert record["product_id"] == product_id
    assert record["offer_timing_id"] == product["offer_timing_id"]
    assert record["offer_timing_id"] not in seen_timing_ids, "duplicate timing mapping"
    seen_timing_ids.add(record["offer_timing_id"])
    current, result = record["current_offer"], record["timing_result"]
    assert isinstance(current["comparable_value"], (int, float)) and not isinstance(current["comparable_value"], bool)
    assert current["comparison_unit"]
    assert result["rating"] in {"史高", "较高", "一般", "较低", "无法判断"}
    assert result["wait"] in {"建议等待", "不建议等待", "无法判断"}

# Every runtime final state must have both final copy and CTA copy.
states = {x["state"] for x in orchestrator["runtime_priority"]}
assert states <= set(templates["final_templates"]), "orchestrator state missing final template"
assert states <= set(templates["cta"]), "orchestrator state missing CTA"
for rule_id, tids in templates["rule_template_index"].items():
    assert rule_id in rules, f"template index references unknown Rule ID: {rule_id}"
    for tid in tids:
        assert tid in templates["rule_templates"], f"template index references missing template: {tid}"

# Offer History must be traceable to the exact locked Offer Timing workbook bytes.
assert history_validation["source_sha256"] == source_lock["sources"]["offer_timing"]["sha256"], "Offer History source hash drift"

# Engine metadata must track the actually deployed normalizer version.
normalizer_source = (ROOT / "engines/fact-normalizer.js").read_text(encoding="utf-8")
match = re.search(r"version:'fact-normalizer-([^']+)'", normalizer_source)
assert match, "could not read FactNormalizer version"
assert manifest["engine"]["fact_normalizer"] == match.group(1), "FactNormalizer manifest version drift"

print(json.dumps({
    "runtime_files": len(manifest_data_keys),
    "locked_sources": len(source_lock["sources"]),
    "repo_contracts": len(source_lock["repo_contracts"]),
    "generated_runtime": len(source_lock["generated_runtime"]),
    "rules": len(rules),
    "products": len(product_ids),
    "status": "PASS"
}, ensure_ascii=False))
