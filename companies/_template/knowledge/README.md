# {Company} Knowledge

Replace `{Company}` with the actual company name.

This directory holds company-scoped knowledge files: brand guidelines, product context,
team structure, infrastructure docs, and any other reference material specific to this company.

## Structure

```
knowledge/
  INDEX.md          navigable map of this company's knowledge (required)
  brand/            brand guidelines, tone of voice, visual identity
  product/          product context, roadmaps, feature specs
  infrastructure/   hosting, DNS, deployment targets, credentials guide
  team/             org chart, roles, points of contact
```

## Rules

- All files are committed to GHQ git directly — no symlinks, no separate repos.
- Never include raw credentials here; use `settings/` (shielded by .claudeignore).
- Keep INDEX.md up to date when adding new files or directories.
- Company-scoped knowledge must never appear in another company's outputs.

## Getting started

1. Copy this template directory to `companies/{slug}/knowledge/`.
2. Rename and fill in the sections relevant to your company.
3. Create an `INDEX.md` listing all knowledge files.
4. Register the company in `companies/manifest.yaml`.
