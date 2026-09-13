# NextBonus Assessment Test

Standalone test deployment for the NextBonus deterministic Assessment flow.

## What this repo is

- Static single-page test app.
- No GPT/API dependency at runtime.
- Current UI file: `index.html`.
- Intended only for isolated QA before integration into the main NextBonus app.

## Deploy with GitHub Pages

1. Push this repository to GitHub with default branch `main`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` or run the workflow manually from **Actions**.
5. The workflow publishes the site to the repository's GitHub Pages URL.

## Current test behavior

- Assessment completion goes directly to Full Report.
- Unknown/blank answers do not block report generation.
- Unknown Bank Rule facts are explained inside the report instead of forcing extra questions.
- Unknown approval inputs render approval as `无法判断`.
- Unknown long-term inputs render long-term value as `无法判断`.
- Hard WAIT/BLOCK rules still take priority when known.
- Offer Detail summary remains separate from the Full Report.

## Historical offer chart

Full Report now adds a native SVG history chart below the existing current-offer text. The chart reads a checked-in static JSON export; it never recalculates Assessment decisions. See [OFFER_HISTORY.md](OFFER_HISTORY.md) for mapping, filters, source issues, tests and the reviewed update process.

Open the [test website](https://ymlulu.github.io/nextbonus-assessment-test/) to use the chart. Offline direct-file use retains the text-only Assessment if static JSON cannot load.

## Important

This repository contains client-side test logic. If the GitHub Pages site is publicly accessible, the HTML/JS and embedded rule logic are also publicly inspectable. Use a private repository / restricted Pages visibility if these rules should not be public.
