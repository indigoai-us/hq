---
id: feature-flag-first
title: New {PRODUCT}/{Product} Features Must Ship Behind Beta Brand Permissions
scope: {company}
trigger: before implementing any new feature that touches ETL Lambdas, CubeJS cubes, or frontend dashboard pages in the {product} repo
enforcement: hard
version: 1
created: 2026-02-27
updated: 2026-02-27
---

## Rule

1. Any new feature that affects ETL Lambdas, CubeJS cubes, or frontend dashboard pages in the {PRODUCT} repo MUST be gated behind `brand_permissions` with a `beta:` attribute before the PR is merged to main. Never ship to production without per-brand activation capability.

2. Prefer data-only migrations (INSERT into `permissions` + `brand_permissions`) over schema-changing migrations (CREATE TABLE, ALTER TABLE) when adding feature activation flags. The existing `brand_permissions` table is the correct mechanism.

3. Every PR that introduces a new gated feature MUST include: (a) a seed migration inserting the `beta:feature-name` permission record, and (b) `brand_permissions` rows for at least 1 pilot brand in the same PR.

4. The pattern for checking flags:
   - **ETL Lambdas:** `getBrandPermissions(dbClient, 'beta:feature-name')` at handler start; skip non-permitted brands
   - **Frontend:** `hasBrandPermission(brandId, 'beta:feature-name')` server-side; redirect if not permitted
   - **CubeJS:** row-level security filter on `brand_permissions` table in the cube YAML

5. Global `FEATURE_FLAGS` env var is for platform-wide rollouts only (affects all clients). Do NOT use it for per-client beta programs.

## Examples

**Correct:**
- PR adds cockpit dashboard; includes seed migration for `beta:cockpit-dashboard`; dashboard/page.tsx checks `hasBrandPermission(brandId, 'beta:cockpit-dashboard')` server-side before rendering
- New ETL Lambda added; it calls `getBrandPermissions(dbClient, 'beta:my-feature')` at start and skips non-permitted brands

**Incorrect:**
- PR adds a new dashboard page that renders for ALL brands on merge
- ETL Lambda runs for all brands without checking permissions
- Developer uses `FEATURE_FLAGS` env var for a feature that should be per-client (requires redeployment to toggle)
- Schema migration (CREATE TABLE) used to add a feature flag when a simple INSERT would suffice
