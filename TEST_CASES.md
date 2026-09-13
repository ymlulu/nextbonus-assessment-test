# Smoke Test Cases

After deployment, verify at least these paths:

1. All general approval answers unknown → Full Report still renders; approval = 无法判断.
2. CSP 5/24 unknown → Full Report renders and explains the rule cannot be confirmed.
3. CSP 5/24 triggered → 建议等待; approval = 极低; no conflicting positive approval copy.
4. CSP current-holder block → 暂不建议申请.
5. AMEX Gold family history unknown → Full Report renders; bonus eligibility = 不确定.
6. AMEX Gold family rule triggered → only one user-facing family-rule explanation after coalescing.
7. AMEX count 8–9 → AMEX-008 does not trigger.
8. AMEX count 10+ → AMEX-008 soft impact triggers.
9. Bilt denial <45 days → 建议等待.
10. Venture X 48-month bonus rule → WAIT_BONUS_RULE takes priority over offer timing wait.
11. Citi 2/65 → application wait.
12. Citi Strata Elite conversion history → bonus wait with conversion-specific explanation.
13. Q7/Q8 unknown → Full Report renders; long-term value = 无法判断.
14. AS HIGH AS offer → shows maximum wording and warns actual shown offer may be lower.
15. Full Report → Offer Detail → Full Report round-trip preserves the same assessment result.
