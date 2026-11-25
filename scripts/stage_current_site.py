"""Publish only the current independent assessment; retain v1 fixtures in Git."""
import argparse
from pathlib import Path
from shutil import copy2

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ".nojekyll", "index.html", "dynamic-questionnaire.html", "bridge.html",
    "adapters/card-identity-v1.js", "adapters/assessment-api-v2.js",
    "adapters/static-bridge-v2.js", "engines/bank-rules-runtime.js",
    "assets/assessment-loader-v2.js", "assets/dynamic-questionnaire-demo.js",
    "data/card-identity-index.json", "data/amex-formal-product-identities.json",
    "data/offer-history.json", "data/offer-timing.json",
    "bank-rules/rules.json", "bank-rules/facts.json", "bank-rules/products.json",
    "bank-rules/approval.json",
]
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    out = parser.parse_args().output.resolve()
    for rel in FILES:
        if not (ROOT / rel).is_file():
            raise FileNotFoundError(rel)
    out.mkdir(parents=True, exist_ok=False)
    for rel in FILES:
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        copy2(ROOT / rel, dest)
    print(f"Staged {len(FILES)} current assessment assets to {out}")

if __name__ == "__main__":
    main()
