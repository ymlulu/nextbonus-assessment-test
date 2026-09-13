# QA results — 2026-09-13

Offer-history increment: the supplied Excel sources have now been inspected for the chart integration. See [OFFER_HISTORY.md](OFFER_HISTORY.md) for the current source review, graph tests and unchanged-business-output verification. The original deployment notes below describe the earlier release.

## Status

Published to https://ymlulu.github.io/nextbonus-assessment-test/ after explicit public-release authorization. GitHub Actions run 34728940718 succeeded. The smoke tests below were repeated on the live HTTPS site in Edge with the same results as local testing.

Source: supplied nextbonus-assessment-test.zip, VERSION V2.2. No separate NextBonus_Assessment_Offline_V2_2.html or Full Report Template Registry V1.xlsx was available; independent source comparison and Registry QA remain pending. Embedded sourceVersions QA claims are not independently verified.

## Smoke tests

| Request | Result |
|---|---|
| 1 Normal AMEX Gold | PASS: Full Report, 现在申请 |
| 2 CSP 5/24 | PASS: 建议等待, 5/24 explanation |
| 3 CSP current holder | PASS: Application BLOCK, 暂不建议申请 |
| 4 Gold held Platinum | PASS: Bonus BLOCK, Family Rule once in bonus section |
| 5 AMEX 8–9 | PASS: no AMEX-008 |
| 6 AMEX 10+ | PASS: AMEX-008 soft impact |
| 7 Bilt denial under 45 days | PASS: 建议等待 |
| 8 Venture X 48-month history | PASS: WAIT_BONUS_RULE |
| 9 Citi 2/65 | PASS: WAIT_APPLICATION_RULE |
| 10 Elite conversion / source bonus under 48 months | PASS: WAIT_BONUS_RULE, conversion explanation |
| 11 A1–A4 unknown | PASS: report, approval 无法判断 |
| 12 All answers blank, all six cards | PARTIAL: every report renders; approval and long-term 无法判断. Gold/Platinum incorrectly show bonus 可以; other four show 不确定 |
| 13 Report → Offer → same report | PASS: exact report text preserved; engine replaced with throwing stub during return to detect any reassessment |

Additional: local file and live HTTPS load and refresh passed; no pageerror events; no application API or external asset requests (live requests were page navigation / refresh only); 390px viewport has no horizontal overflow. Refresh returns to the questionnaire, not the prior report. External application links were not followed.

## Business issues — unchanged

1. **AMEX blank bonus history**: bankRules checks `held.some(unknown)`. An unanswered checkbox group yields `[]`, so it records no missing bonus fact and reports bonus eligibility as 可以. Reproduce on Gold or Platinum by leaving all questions blank and submitting. Expected: 不确定 and an explanation of missing history. No rule changes made.
2. **Unapproved wording**: Venture X current-offer paragraph contains “现在可以考虑等一等”. This conflicts with the requested avoidance of “可以考虑”. Kept unchanged because it is existing report template copy requiring confirmation.

This is smoke testing against the supplied snapshot, not certification of real bank policy or exhaustive template QA.

## Frontend-only changes

- Capture assessment date at submission, replacing the incorrectly displayed rule snapshot date in the Full Report.
- Display that same assessment date in Offer Detail.
- Rename report navigation to 返回 Offer and Offer application button to 去申请.
- No engine, rule, approval, timing, long-term calculation, recommendation or application URL changes.
- Original root Pages workflow and .nojekyll retained. No framework or runtime dependency added.

## Deployment

main branch; root static artifact; GitHub Pages build_type=workflow. No build framework or npm required. Repository: https://github.com/ymlulu/nextbonus-assessment-test

