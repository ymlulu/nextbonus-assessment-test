#!/usr/bin/env python3
"""Build or verify the committed NextBonus runtime data from reviewed source workbooks.

The website never reads Excel or Google Drive at runtime. This command is the offline
publication boundary: reviewed source files -> deterministic JSON -> validation -> PR.

Source workbook SHA256 values are locked in data/source-lock.json. If an official source
changes, review that source first and update its locked SHA256 in the same feature branch
before using --write. --write refreshes generated Git-blob hashes in the source lock and
runtime manifest; it never changes source SHA256 values by itself.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = [
    "bank-rules.json",
    "offer-timing.json",
    "offer-history.json",
    "offer-history-validation.json",
    "approval-config.json",
    "long-term.json",
    "orchestrator.json",
    "report-templates.json",
]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_blob_sha(path: Path):
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def run(*args):
    print("+", " ".join(map(str, args)))
    subprocess.run([str(x) for x in args], cwd=ROOT, check=True)


def verify_sources(source_dir: Path, registry: dict, lock: dict):
    paths = {}
    for key, meta in registry["sources"].items():
        path = source_dir / meta["file_name"]
        if not path.exists():
            raise SystemExit(f"missing reviewed source: {path}")
        locked = lock["sources"].get(key)
        if not locked:
            raise SystemExit(f"source not locked: {key}")
        actual = sha256(path)
        if actual != locked["sha256"]:
            raise SystemExit(
                f"source SHA256 changed for {key}: {actual}; review source and update data/source-lock.json first"
            )
        if str(meta.get("snapshot")) != str(locked.get("snapshot")):
            raise SystemExit(f"snapshot mismatch between registry and source lock: {key}")
        paths[key] = path
    return paths


def build(source_dir: Path, output_dir: Path):
    registry = load(ROOT / "config/runtime-source-registry.json")
    lock = load(ROOT / "data/source-lock.json")
    src = verify_sources(source_dir, registry, lock)
    output_dir.mkdir(parents=True, exist_ok=True)

    run(
        sys.executable, ROOT / "scripts/export_bank_rules.py", src["bank_rules"],
        "--predicates", ROOT / "data/bank-rule-predicates.json",
        "--current-runtime", ROOT / "data/bank-rules.json",
        "--output", output_dir / "bank-rules.json",
    )
    run(
        sys.executable, ROOT / "scripts/export_offer_timing.py", src["offer_timing"],
        "--output", output_dir / "offer-timing.json",
    )

    # Preserve the existing validation artifact's legacy encoded source filename while
    # using exactly the reviewed Offer Timing.xlsx bytes.
    history_input = output_dir.parent / registry["sources"]["offer_timing"].get(
        "export_file_name", registry["sources"]["offer_timing"]["file_name"]
    )
    shutil.copy2(src["offer_timing"], history_input)
    run(
        sys.executable, ROOT / "scripts/export_offer_history.py", history_input,
        "--output-dir", output_dir,
    )
    run(
        sys.executable, ROOT / "scripts/export_assessment_runtime.py",
        "--approval", src["approval"],
        "--long-term", src["long_term"],
        "--orchestrator", src["orchestrator"],
        "--registry", src["report_templates"],
        "--out-dir", output_dir,
    )


def compare(generated_dir: Path):
    differences = []
    for name in GENERATED:
        generated = generated_dir / name
        committed = ROOT / "data" / name
        if not generated.exists() or not committed.exists() or generated.read_bytes() != committed.read_bytes():
            differences.append(name)
    return differences


def refresh_hash_metadata():
    lock_path = ROOT / "data/source-lock.json"
    lock = load(lock_path)
    for rec in lock["repo_contracts"].values():
        rec["git_blob_sha"] = git_blob_sha(ROOT / rec["path"])
    for rec in lock["generated_runtime"].values():
        rec["git_blob_sha"] = git_blob_sha(ROOT / rec["path"])
    dump(lock_path, lock)

    manifest_path = ROOT / "data/runtime-manifest.json"
    manifest = load(manifest_path)
    for key, rec in manifest.items():
        if isinstance(rec, dict) and rec.get("path") and (ROOT / rec["path"]).exists() and key != "source_lock":
            rec["git_blob_sha"] = git_blob_sha(ROOT / rec["path"])
    dump(manifest_path, manifest)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source-dir", type=Path, required=True, help="Directory containing the reviewed XLSX source files")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Verify source-generated JSON is byte-identical to committed data (default)")
    mode.add_argument("--write", action="store_true", help="Replace committed generated JSON and refresh data hashes")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory(prefix="nextbonus-runtime-") as tmp:
        out = Path(tmp) / "data"
        build(args.source_dir, out)
        differences = compare(out)
        if args.write:
            for name in GENERATED:
                shutil.copy2(out / name, ROOT / "data" / name)
            refresh_hash_metadata()
            run(sys.executable, ROOT / "scripts/validate_runtime_data.py")
            print(json.dumps({"status":"PASS","mode":"write","generated":len(GENERATED),"changed_before_write":differences}, ensure_ascii=False))
            return
        if differences:
            raise SystemExit("runtime drift: " + ", ".join(differences))
        run(sys.executable, ROOT / "scripts/validate_runtime_data.py")
        print(json.dumps({"status":"PASS","mode":"check","generated":len(GENERATED),"differences":0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
