# Phase 5A — Product Readiness Gate

Phase 5A adds a deterministic expansion gate before the Assessment grows beyond the current six-card launch set.

This phase does **not** choose the V1 20-card list and does **not** add new card business rules. The authoritative project material still lists only six active Assessment products, and the future 20-card list has not yet been frozen in the current source material. Phase 5A therefore builds the machinery needed to expand safely without inventing product scope.

## Goal

A card should not become an active Assessment product merely because it was added to `products.json` or because one engine happens to know about it.

For every active product, CI must be able to prove that the current runtime architecture has all required cross-module wiring and that the product can execute deterministically end-to-end.

## Static readiness checker

Run:

```bash
python scripts/check_product_readiness.py
```

For a card being built on a feature branch:

```bash
python scripts/check_product_readiness.py --product <product_id>
```

The explicit `--product` mode can be used before the product exists everywhere. Missing components are reported as gaps; the checker never guesses values or derives business rules from prose.

For each product, the checker validates:

1. **Product contract**
   - product entry exists
   - `product_id`, name, issuer, sensitivity, Offer Timing ID and URLs are populated
   - article/application URLs are absolute HTTP(S) URLs
2. **Questions**
   - product question contract exists
   - Q5 and Q6 exist
3. **Fact Mapping**
   - product fact mapping exists
   - mapped Q5/Q6 source IDs resolve to actual answer IDs, including generated numeric follow-ups
4. **Offer Timing**
   - product timing record exists
   - product and Offer Timing IDs route consistently
   - current comparable value/unit and timing output satisfy the runtime enum contract
5. **Long-term**
   - annual fee, Q7 and Q8 contracts exist
6. **Approval**
   - product issuer is explicitly represented in Approval issuer sensitivity
   - product-specific overlay remains optional; the checker does not invent one
7. **Bank Rules**
   - at least one explicit `target_products` route exists
   - every routed Rule ID has a runtime rule definition
   - every routed rule's required product fact is provided by the product Fact Mapping
8. **Report Templates**
   - routed rules have valid template-index entries
   - referenced rule templates exist
   - product-level application-clear copy exists

The checker intentionally validates wiring, not the truth of business facts. Business facts must continue to come from the reviewed Source/Contract publication flow.

## Runtime smoke gate

Run:

```bash
node tests/product-readiness-smoke.cjs
```

The smoke test discovers every active product from `products.json`, builds the same data-driven Runtime used by the test page, evaluates each product twice with identical unknown/blank answers, and requires:

- no runtime exception
- a Full Report
- a final state
- byte-identical serialized result for the two identical runs

This is not a replacement for fixed-profile E2E acceptance or product-specific business-rule tests. It is the minimum executable gate that every active product must pass automatically.

## CI

The PR workflow now runs, in order:

1. compile publication scripts
2. validate committed Runtime contracts / provenance
3. run the Phase 5A active-product readiness checker
4. verify publication CLI
5. run deterministic smoke evaluation for every active product
6. run the existing Phase 2 → Phase 3 regression matrix
7. run the AMEX empty-history semantic regression

A product expansion PR must therefore pass both the existing architecture/regression checks and the new product-level gates before merge.

## Adding the next card

After the V1 product list is formally frozen, add cards one at a time on a feature branch.

Recommended loop:

```text
formal reviewed source / contract
→ Product
→ Questions
→ Fact Mapping
→ explicit Rule routing + predicates
→ Timing
→ Approval routing / overlay when formally required
→ Long-term
→ Templates
→ product-specific regression / fixed-profile E2E
→ check_product_readiness.py
→ PR
→ CI
→ merge
```

Do not add a card to the active runtime simply to make the checker green. Missing business definitions should remain visible as missing until they are reviewed.

## Scope boundary

Phase 5A does not:

- change the current six-card business output
- change Bank Rule definitions or predicates
- change Offer Timing values
- change Approval, Long-term or Orchestrator logic
- change report copy
- add a guessed 20-card product list
- weaken Source Lock / Runtime Manifest provenance

The current runtime remains the existing six-card Assessment until a later product-expansion PR intentionally changes it.
