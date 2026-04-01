---
id: agent-browser-react-false-positives
title: "agent-browser E2E: verify data-dependent pages have data before reporting bugs"
scope: global
trigger: agent-browser, E2E testing, bug reporting
enforcement: soft
created: 2026-03-28
---

## Rule

When running E2E tests with agent-browser against data-dependent pages:

1. **Check API connectivity first** — before testing pages that depend on API data (artists, tours, etc.), verify the API is reachable from the browser by evaluating a test fetch in the browser context.
2. **Don't report "empty page" as a bug** without checking if the page is genuinely broken vs. just lacking data context (e.g., "Select an artist" is expected when no artist is loaded).
3. **React controlled components** — agent-browser's `click` may not trigger React state changes on all elements (especially button→dropdown toggles). If a click doesn't produce visible changes, try `agent-browser find` with semantic locators, or verify the DOM directly before reporting as a bug.
4. **Cross-reference findings** — before filing bugs, read the actual source code of the page to confirm the feature is truly missing vs. an E2E testing artifact.

## Rationale

2026-03-27 {company} E2E test produced 3 false positives out of 5 bugs: logout dropdown "not working" (React state didn't toggle), tours/my-site "empty" (API URL was broken so no artist context loaded), requests 404 (navigated to wrong URL instead of clicking sidebar link).
