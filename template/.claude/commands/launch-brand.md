---
description: Launch a new DTC brand - from concept to execution-ready PRD in one session
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
argument-hint: [brand-name or description]
visibility: public
---

# /launch-brand - DTC Brand Launch Command

Go from brand concept to execution-ready PRD with full company infrastructure in one interactive session. Based on the {COMPANY} launch playbook.

**User's input:** $ARGUMENTS

**Important:** Do NOT implement the store. Just create the PRD and infrastructure.

## Step 1: Get Brand Concept

If $ARGUMENTS provided, use as starting point for brand name/concept.
If empty, ask: "What brand are you launching? Give me the name and a one-sentence description."

## Step 2: Discovery Interview

Ask questions in 2 batches. Users respond with numbered answers or shorthand.

### Batch 1: Brand + Product

```
Let's define the brand and product line:

1. Brand name (display name, e.g. {COMPANY})?
2. Product category (clothing, accessories, home goods, beauty, food)?
3. Fulfillment provider (TapStitch, Printful, custom warehouse, other)?
4. Aesthetic references (2-3 brands that inspire the look, e.g. COS, Aesop, Everlane)?
5. Product types (comma-separated, e.g. tees, hoodies, sweaters, bombers)?
6. Pricing position (e.g. premium basics 60-70% margin, luxury 70%+ margin, value 50-60% margin)?
7. Size range (e.g. S-3XL, XS-XL, One Size)?
```

Wait for user response. Parse answers.

### Batch 2: Infrastructure

```
Now the infrastructure:

1. Target domain (e.g. wear{company}.com)?
2. Existing Shopify store? (slug like "{company}-8", or "none" to create later)
3. GitHub org for the repo (e.g. {your-username})?
4. Color direction — primary, secondary, accent hex codes? (or "decide later")
5. Font direction — heading + body fonts? (or "decide later")
6. Any existing assets (logo, images, brand guide)? ("none" is fine)
```

Wait for user response. Parse answers.

### Derive Remaining Variables

From the interview answers, compute:

```
brand_name        = Batch 1, Q1
brand_slug        = lowercase, hyphens only version of brand_name
brand_description = synthesize from concept + category + aesthetic
product_category  = Batch 1, Q2
fulfillment_provider = Batch 1, Q3
aesthetic_refs    = Batch 1, Q4
product_types     = Batch 1, Q5
pricing_position  = Batch 1, Q6
size_range        = Batch 1, Q7
domain            = Batch 2, Q1
shopify_store_slug = Batch 2, Q2 (or "{brand_slug}-1" placeholder if "none")
github_org        = Batch 2, Q3
color_primary     = Batch 2, Q4 (or "#2C2C2C" default)
color_secondary   = Batch 2, Q4 (or "#FAF8F5" default)
color_accent      = Batch 2, Q4 (or "#A8A29E" default)
font_heading      = Batch 2, Q5 (or "DM Sans" default)
font_body         = Batch 2, Q5 (or "Work Sans" default)
vercel_org        = look up from CLAUDE.md vercel org mapping based on github_org, or ask user
```

## Step 3: Scaffold Company Infrastructure

### 3a. Check if company exists

Read `companies/manifest.yaml` and check if `{brand_slug}` entry exists.

**If company already exists:**
```
Company "{brand_slug}" already exists in manifest.yaml.
Verifying infrastructure...
```
- Verify `companies/{brand_slug}/settings/` exists
- Verify `companies/{brand_slug}/data/` exists
- Verify `companies/{brand_slug}/knowledge/` exists (embedded repo)
- Report any missing pieces and create them
- Skip to Step 4

**If company does not exist:**

Run the /newcompany scaffold logic inline:

```bash
# Create directories
mkdir -p companies/{brand_slug}/{settings,data}
```

Create knowledge repo:
```bash
mkdir -p companies/{brand_slug}/knowledge
cd companies/{brand_slug}/knowledge
git init
echo "# {brand_name} Knowledge Base" > README.md
git add -A && git commit -m "init: knowledge base"
```

### 3b. Update manifest.yaml

Add entry (all fields non-null, use empty arrays):
```yaml
{brand_slug}:
  github_org: {github_org}
  repos: []
  settings: []
  workers: []
  knowledge: companies/{brand_slug}/knowledge/
  deploy: []
  vercel_projects: []
  qmd_collections: [{brand_slug}]
```

### 3c. Update modules.yaml

Add knowledge module:
```yaml
- name: knowledge-{brand_slug}
  repo: local
  branch: main
  strategy: embedded
  access: team
  paths:
    .: companies/{brand_slug}/knowledge
```

### 3d. Create qmd collection

```bash
qmd collection add companies/{brand_slug}/knowledge --name {brand_slug} --mask "**/*.md"
qmd update 2>/dev/null || true
```

### 3e. Write company README

Write `companies/{brand_slug}/README.md`:
```markdown
# {brand_name}

DTC {product_category} brand. {brand_description}

## Infrastructure
- **Settings:** `companies/{brand_slug}/settings/`
- **Data:** `companies/{brand_slug}/data/`
- **Knowledge:** `companies/{brand_slug}/knowledge/`
- **Domain:** {domain}
```

### 3f. Update CLAUDE.md companies list

If the companies line in `.claude/CLAUDE.md` does not include `{brand_slug}`, update it.

### 3g. Verify scaffold

Check:
- `companies/manifest.yaml` has no `null` values for new entry
- Directory structure is complete
- Symlink resolves correctly

## Step 4: Generate PRD from Template

### 4a. Read template

Read `knowledge/public/hq-core/brand-launch-template.json`.

### 4b. Substitute all variables

Replace every `{{variable}}` placeholder with the actual values from Step 2.

Variable substitution map:
```
{{brand_name}}           → {brand_name}
{{brand_slug}}           → {brand_slug}
{{brand_description}}    → {brand_description}
{{product_category}}     → {product_category}
{{fulfillment_provider}} → {fulfillment_provider}
{{aesthetic_refs}}        → {aesthetic_refs}
{{shopify_store_slug}}   → {shopify_store_slug}
{{domain}}               → {domain}
{{github_org}}           → {github_org}
{{vercel_org}}           → {vercel_org}
{{color_primary}}        → {color_primary}
{{color_secondary}}      → {color_secondary}
{{color_accent}}         → {color_accent}
{{font_heading}}         → {font_heading}
{{font_body}}            → {font_body}
{{product_types}}        → {product_types}
{{size_range}}           → {size_range}
{{pricing_position}}     → {pricing_position}
{{_generated_at}}        → current ISO8601 timestamp
```

### 4c. Add metadata fields

Ensure metadata includes:
- `createdAt`: current ISO8601 timestamp
- `company`: `{brand_slug}`
- `docsPath`: `"none"`

### 4d. Validate: no remaining placeholders

Scan the generated JSON string for any remaining `{{` or `}}`. If found, STOP and report which variables were not substituted.

### 4e. Write prd.json

```bash
mkdir -p projects/{brand_slug}/
```

Write to `projects/{brand_slug}/prd.json`.

### 4f. Generate README.md

Derive from the prd.json data:

```markdown
# {brand_slug}

**Goal:** {metadata.goal}
**Success:** {metadata.successCriteria}
**Repo:** {metadata.repoPath}
**Branch:** {branchName}
**Company:** {brand_slug}

## Overview
{description}

## Quality Gates
- `{metadata.qualityGates[0]}`

## User Stories

### US-001: {title}
**Description:** {description}
**Priority:** {priority}
**Depends on:** {dependsOn or "None"}

**Acceptance Criteria:**
- [ ] {criterion 1}
- [ ] {criterion 2}

(repeat for all 10 stories)

## Knowledge References
- Playbook: knowledge/public/hq-core/shopify-launch-playbook.md
- Template source: knowledge/public/hq-core/brand-launch-template.json

## Manual Prerequisites
See "Next Steps" output below.
```

Write to `projects/{brand_slug}/README.md`.

## Step 5: Register with Orchestrator

Read `workspace/orchestrator/state.json`. Append to `projects` array:

```json
{
  "name": "{brand_slug}",
  "state": "READY",
  "prdPath": "projects/{brand_slug}/prd.json",
  "updatedAt": "{ISO8601}",
  "storiesComplete": 0,
  "storiesTotal": 10,
  "checkedOutFiles": []
}
```

If project already exists in state.json, update it instead of duplicating.

## Step 6: Post-Creation

### 6a. Capture Learning via /learn

Run `/learn` with:
```json
{
  "source": "build-activity",
  "severity": "medium",
  "scope": "global",
  "rule": "Brand {brand_name} launched at projects/{brand_slug}/ with 10 stories targeting repos/private/{brand_slug}-store",
  "context": "Created via /launch-brand"
}
```

### 6b. Reindex

```bash
qmd update 2>/dev/null || true
```

### 6c. Update projects INDEX

Regenerate `projects/INDEX.md` to include the new project.

## Step 7: Report + Next Steps

Present to user:

```
Brand launch infrastructure created for {brand_name}!

Files created:
  companies/{brand_slug}/           (company scaffold)
  projects/{brand_slug}/prd.json    (10-story execution plan)
  projects/{brand_slug}/README.md   (human-readable view)

Orchestrator: registered in state.json (READY)

---

MANUAL PREREQUISITES (before running /run-project {brand_slug}):

1. Shopify Store
   - Create store at https://admin.shopify.com (Basic plan, $39/mo)
   - Note the store slug (e.g. "{shopify_store_slug}")
   - See playbook section 1: knowledge/public/hq-core/shopify-launch-playbook.md

2. Shopify API Credentials
   - Create custom app in Shopify Dev Dashboard
   - Enable scopes: write_products, read_products, write_inventory, read_inventory,
     read_product_images, write_product_images, read_orders
   - Copy client_id and client_secret (shpss_ token)
   - Save to: companies/{brand_slug}/settings/shopify/.env

3. Domain
   - Purchase {domain} from registrar (Name.com, Namecheap, Cloudflare)
   - DNS configuration happens in US-009 (Deploy + SEO)

4. Fulfillment
   - Set up {fulfillment_provider} account
   - App installation happens in US-003 (Shopify Setup)

---

Recommended execution:
  /run-project {brand_slug}    (orchestrator loop — runs all 10 stories)
  /execute-task {brand_slug}/US-001   (run stories one at a time)
```

## Rules

- **Do NOT implement** — only create the PRD and infrastructure
- **prd.json is the source of truth** — README.md is derived, never the reverse
- **No remaining {{}} placeholders** — validate before writing prd.json
- **Infrastructure before planning** — company scaffold must complete before PRD generation
- **All manifest.yaml fields non-null** — use empty arrays `[]`, not `null`
- **Follow /newcompany pattern** for company scaffolding (knowledge repo, manifest, modules, qmd)
- **Follow /prd pattern** for project registration (state.json, INDEX.md)
- **Playbook is the reference** — all prerequisite guidance references `shopify-launch-playbook.md`
- **Sensible defaults** — use default colors/fonts if user says "decide later" (can be changed in US-001 Brand Identity story)
- **Never skip the interview** — both batches must be asked, even if $ARGUMENTS provides some info
- **Company isolation** — new company gets its own settings, data, knowledge dirs; never share with other companies
