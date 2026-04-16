---
id: hq-site-rebuild-asset-audit
title: Audit total asset count when scraping sites for rebuilds
scope: global
trigger: site rebuild, asset download, US-002-style asset scraping stories
enforcement: soft
version: 1
created: 2026-03-12
updated: 2026-03-12
source: success-pattern
---

## Rule

ALWAYS compare total asset count between source site and destination repo when scraping assets for site rebuilds. Do not rely solely on pattern-matching brand/entity names — site-level assets (hero videos, background images, global media, intro reels) are commonly missed because they lack entity-specific naming. After downloading, run a count comparison: source asset URLs vs local files.

