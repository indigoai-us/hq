---
id: hq-gnb-product-imagery-remix
title: Use GNB Remix for Branded Product Imagery
scope: global
trigger: generating lifestyle or product imagery for any DTC brand
enforcement: soft
version: 1
created: 2026-03-21
updated: 2026-03-21
source: success-pattern
---

## Rule

NEVER generate branded product imagery (cans, bottles, packaging) from text descriptions alone. AI image generators consistently produce wrong brand text, colors, and label layouts (e.g. "SPARKLE" instead of "{company}").

ALWAYS use this two-step workflow:
1. Generate the lifestyle scene first (person, setting, lighting) — the product will have wrong branding, that's expected
2. Use `gnb remix <lifestyle-photo> "<prompt to replace product>"` with detailed description of the actual product appearance to fix the branding

Reference actual product photos from `companies/{co}/data/product-images/` or `companies/{co}/data/design-files/renders/` for accurate brand details in the remix prompt.

## Rationale

During {company} PDP design (Mar 2026), generated lifestyle photos showed models holding cans branded "SPARKLE", "VELOCITY", and "FUEL" instead of {company}. The GNB remix approach using the actual blood-orange-01.png product photo as reference produced correct coral-orange {company} cans with proper logo, citrus icon, and PROTEIN text. Scene composition, lighting, and model poses were preserved perfectly through remix.
