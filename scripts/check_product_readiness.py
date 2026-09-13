#!/usr/bin/env python3
"""Product-level launch-readiness checks for NextBonus Assessment.

This gate is intentionally deterministic and repository-local. It does not infer
business rules from prose and it does not decide which products should launch.
It answers a narrower question: for every product declared active in
``data/products.json``, are the runtime contracts needed by the current
Assessment architecture present and internally routable?

Use ``--product <id>`` while building a new card to get a focused gap report.
A product ID passed explicitly does not need to exist yet; missing components are
reported instead of guessed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def load(path: str) -> Any:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def question_ids(card_questions: dict[str, Any]) -> set[str]:
    """Collect answer IDs exposed by Q5/Q6, including conditional number IDs."""
    ids: set[str] = set()
    for key in ("q5", "q6"):
        question = card_questions.get(key)
        if not isinstance(question, dict):
            continue
        if question.get("id"):
            ids.add(str(question["id"]))
        for sub in question.get("subs", []) or []:
            if sub.get("id"):
                ids.add(str(sub["id"]))
            if sub.get("number_id"):
                ids.add(str(sub["number_id"]))
    return ids


def predicate_target_products(predicates: dict[str, Any]) -> dict[str, set[str]]:
    routed: dict[str, set[str]] = {}
    for rule_id, record in predicates.items():
        for product_id in record.get("applicability", {}).get("target_products", []) or []:
            routed.setdefault(str(product_id), set()).add(rule_id)
    return routed


def result_record(product_id: str) -> dict[str, Any]:
    return {"product_id": product_id, "checks": [], "errors": [], "warnings": []}


def check(record: dict[str, Any], name: str, ok: bool, detail: str) -> None:
    record["checks"].append({"check": name, "status": "PASS" if ok else "FAIL", "detail": detail})
    if not ok:
        record["errors"].append(f"{name}: {detail}")


def validate_product(
    product_id: str,
    *,
    products: dict[str, Any],
    questions: dict[str, Any],
    fact_mapping: dict[str, Any],
    timing: dict[str, Any],
    long_term: dict[str, Any],
    approval: dict[str, Any],
    rules: dict[str, Any],
    predicates: dict[str, Any],
    templates: dict[str, Any],
    routed_rules: dict[str, set[str]],
) -> dict[str, Any]:
    rec = result_record(product_id)

    product = products.get("cards", {}).get(product_id)
    check(rec, "product_contract", isinstance(product, dict), "products.json entry must exist")
    if isinstance(product, dict):
        required = ("product_id", "name", "issuer", "sensitivity", "offer_timing_id", "article_url", "application_url")
        missing = [field for field in required if product.get(field) in (None, "")]
        if product.get("product_id") not in (None, product_id):
            missing.append("product_id_mismatch")
        check(rec, "product_fields", not missing, "missing/invalid: " + ", ".join(missing) if missing else "required product fields present")
        urls_ok = all(str(product.get(field, "")).startswith(("https://", "http://")) for field in ("article_url", "application_url"))
        check(rec, "product_urls", urls_ok, "article/application URLs must be absolute HTTP(S) URLs")
    else:
        product = {}

    card_questions = questions.get("cards", {}).get(product_id)
    check(rec, "questions", isinstance(card_questions, dict), "questions.json card entry must exist")
    if isinstance(card_questions, dict):
        missing_q = [key.upper() for key in ("q5", "q6") if not isinstance(card_questions.get(key), dict)]
        check(rec, "questions_q5_q6", not missing_q, "missing: " + ", ".join(missing_q) if missing_q else "Q5/Q6 present")
    else:
        card_questions = {}

    mapping = fact_mapping.get("cards", {}).get(product_id)
    check(rec, "fact_mapping", isinstance(mapping, dict) and isinstance(mapping.get("facts"), dict), "fact-mapping.json facts must exist")
    facts = mapping.get("facts", {}) if isinstance(mapping, dict) else {}
    exposed_ids = question_ids(card_questions)
    bad_sources: list[str] = []
    for fact_name, spec in facts.items():
        for source_key in ("source", "fallback_source"):
            source = spec.get(source_key)
            if source and str(source) not in exposed_ids:
                bad_sources.append(f"{fact_name}.{source_key}={source}")
    check(rec, "fact_sources", not bad_sources, "unknown question sources: " + ", ".join(bad_sources) if bad_sources else "all mapped sources resolve to Q5/Q6 answer IDs")

    timing_record = timing.get(product_id)
    check(rec, "offer_timing", isinstance(timing_record, dict), "offer-timing.json entry must exist")
    if isinstance(timing_record, dict):
        timing_ok = timing_record.get("product_id") == product_id and timing_record.get("offer_timing_id") == product.get("offer_timing_id")
        check(rec, "offer_timing_route", timing_ok, "product_id and offer_timing_id must match products.json")
        current = timing_record.get("current_offer", {})
        timing_result = timing_record.get("timing_result", {})
        payload_ok = (
            isinstance(current.get("comparable_value"), (int, float))
            and not isinstance(current.get("comparable_value"), bool)
            and bool(current.get("comparison_unit"))
            and timing_result.get("rating") in {"史高", "较高", "一般", "较低", "无法判断"}
            and timing_result.get("wait") in {"建议等待", "不建议等待", "无法判断"}
        )
        check(rec, "offer_timing_payload", payload_ok, "current offer and timing result must satisfy the runtime contract")

    lt = long_term.get("cards", {}).get(product_id)
    check(rec, "long_term", isinstance(lt, dict), "long-term.json card entry must exist")
    if isinstance(lt, dict):
        lt_ok = isinstance(lt.get("annual_fee"), (int, float)) and isinstance(lt.get("q7"), list) and isinstance(lt.get("q8"), list)
        check(rec, "long_term_payload", lt_ok, "annual_fee, q7 and q8 must be present")

    issuer = product.get("issuer")
    issuer_ok = bool(issuer) and issuer in approval.get("issuer_sensitivity", {})
    check(rec, "approval_route", issuer_ok, f"issuer {issuer!r} must exist in approval issuer_sensitivity")

    target_rules = sorted(routed_rules.get(product_id, set()))
    check(rec, "bank_rule_route", bool(target_rules), "at least one explicit predicate target_products route is required")
    unknown_rules = [rule_id for rule_id in target_rules if rule_id not in rules]
    check(rec, "bank_rule_definitions", not unknown_rules, "missing rule definitions: " + ", ".join(unknown_rules) if unknown_rules else f"{len(target_rules)} targeted rule(s) resolve")

    missing_rule_facts: list[str] = []
    for rule_id in target_rules:
        for fact in predicates.get(rule_id, {}).get("required_facts", []) or []:
            name = fact.get("fact")
            if name and name not in facts:
                missing_rule_facts.append(f"{rule_id}:{name}")
    check(rec, "bank_rule_facts", not missing_rule_facts, "unmapped required facts: " + ", ".join(missing_rule_facts) if missing_rule_facts else "all targeted rule required facts are mapped")

    rule_index = templates.get("rule_template_index", {})
    rule_templates = templates.get("rule_templates", {})
    missing_indexes: list[str] = []
    broken_template_ids: list[str] = []
    for rule_id in target_rules:
        tids = rule_index.get(rule_id)
        if not tids:
            missing_indexes.append(rule_id)
            continue
        for tid in tids:
            if tid not in rule_templates:
                broken_template_ids.append(f"{rule_id}:{tid}")
    check(rec, "rule_templates", not missing_indexes and not broken_template_ids,
          ("missing index: " + ", ".join(missing_indexes) + ("; " if broken_template_ids else "") if missing_indexes else "")
          + ("missing templates: " + ", ".join(broken_template_ids) if broken_template_ids else "")
          if (missing_indexes or broken_template_ids) else "all targeted rules have valid report templates")

    application_clear = templates.get("application_clear", {})
    check(rec, "application_clear_copy", product_id in application_clear, "report template application_clear copy must exist")

    rec["status"] = "PASS" if not rec["errors"] else "FAIL"
    rec["targeted_rule_count"] = len(target_rules)
    rec["fact_count"] = len(facts)
    return rec


def main() -> int:
    parser = argparse.ArgumentParser(description="Check product-level Assessment launch readiness")
    parser.add_argument("--product", action="append", dest="products", help="check only this product ID; may be repeated")
    parser.add_argument("--json", action="store_true", help="emit JSON only")
    args = parser.parse_args()

    product_contract = load("data/products.json")
    questions = load("data/questions.json")
    fact_mapping = load("data/fact-mapping.json")
    timing = load("data/offer-timing.json")
    long_term = load("data/long-term.json")
    approval = load("data/approval-config.json")
    rules = load("data/bank-rules.json")
    predicates = load("data/bank-rule-predicates.json")
    templates = load("data/report-templates.json")

    active = list(product_contract.get("display_order", []))
    card_keys = set(product_contract.get("cards", {}))
    display_ok = len(active) == len(set(active)) and set(active) == card_keys

    requested = args.products or active
    routed = predicate_target_products(predicates)
    results = [
        validate_product(
            product_id,
            products=product_contract,
            questions=questions,
            fact_mapping=fact_mapping,
            timing=timing,
            long_term=long_term,
            approval=approval,
            rules=rules,
            predicates=predicates,
            templates=templates,
            routed_rules=routed,
        )
        for product_id in requested
    ]

    global_errors: list[str] = []
    if not display_ok:
        global_errors.append("products.display_order must contain every cards key exactly once")

    payload = {
        "active_products": len(active),
        "checked_products": len(results),
        "global_errors": global_errors,
        "products": results,
        "status": "PASS" if not global_errors and all(r["status"] == "PASS" for r in results) else "FAIL",
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for rec in results:
            marker = "PASS" if rec["status"] == "PASS" else "FAIL"
            print(f"[{marker}] {rec['product_id']} — {rec['targeted_rule_count']} rules, {rec['fact_count']} mapped facts")
            for error in rec["errors"]:
                print(f"  - {error}")
        for error in global_errors:
            print(f"[FAIL] global — {error}")
        print(json.dumps({"products": len(results), "status": payload["status"]}, ensure_ascii=False))

    return 0 if payload["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
