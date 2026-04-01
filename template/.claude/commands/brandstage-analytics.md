---
description: Pull {company} analytics, analyze funnel/revenue/ads, and recommend improvements
allowed-tools: Read, Bash, WebFetch
argument-hint: [7 | 14 | 30 | 90 | all]
visibility: public
---

# /{company}-analytics - {company} Sales Analysis

Pull live data from {company} admin API, Supabase, Meta Ads, and Stripe. Analyze funnel, revenue, traffic, and A/B tests. Output formatted report with ranked improvement recommendations.

**Input:** $ARGUMENTS (days to analyze, default: 30)

## Step 1: Parse Arguments

- `$ARGUMENTS` = number of days: `7`, `14`, `30` (default), `90`, or `all`
- If `all`, use `days=365`
- Store as `DAYS`

## Step 2: Load Credentials

Read `repos/private/{company}/.env.local` and extract:
- `ADMIN_API_KEY` — for admin API auth header
- **Strip quotes**: the `.env.local` wraps values in `"..."`. Use `tr -d '"'` after extraction

**Base URL:** `https://www.{company}.ai`

## Step 3: Pull Data (5 parallel curl calls)

Run all 5 in a single Bash call using `&` backgrounding + `wait`:

```bash
API_KEY=$(grep '^ADMIN_API_KEY=' repos/private/{company}/.env.local | cut -d= -f2 | tr -d '"')
BASE="https://www.{company}.ai"
DAYS=<from step 1>

# 1. KPIs, funnel, revenue, cohorts, top styles
curl -s "$BASE/api/admin/analytics" \
  -H "x-admin-api-key: $API_KEY" > /tmp/bs-analytics.json &

# 2. Event funnel
curl -s "$BASE/api/admin/analytics-events?view=funnel&days=$DAYS" \
  -H "x-admin-api-key: $API_KEY" > /tmp/bs-funnel.json &

# 3. Traffic sources
curl -s "$BASE/api/admin/analytics-events?view=traffic&days=$DAYS" \
  -H "x-admin-api-key: $API_KEY" > /tmp/bs-traffic.json &

# 4. A/B experiments
curl -s "$BASE/api/admin/analytics-events?view=experiments&days=$DAYS" \
  -H "x-admin-api-key: $API_KEY" > /tmp/bs-experiments.json &

# 5. Meta Ads performance
curl -s "$BASE/api/admin/ads/meta?days=$DAYS" \
  -H "x-admin-api-key: $API_KEY" > /tmp/bs-meta-ads.json &

wait
```

Then read each JSON file.

## Step 4: Parse & Compute Metrics

From `bs-analytics.json`:
- `revenue` (total, trend % vs prior period)
- `customers` (count, trend %)
- `orders` (count, trend %)
- `aov` (average order value, trend %)
- `conversionRate` (trend %)
- `topStyles` (array of style names + usage counts)
- `funnel` (visitors → leads → orders → completed)
- `revenueTimeSeries` (daily/weekly data points)

From `bs-funnel.json`:
- Event counts: `page_view`, `view_content`, `lead`, `initiate_checkout`, `purchase`
- Compute stage-to-stage conversion rates

From `bs-traffic.json`:
- `bySource` (utm_source breakdown)
- `byReferrer` (referrer hostname breakdown)
- `byCampaign` (utm_campaign breakdown)

From `bs-experiments.json`:
- Per test: `test_id`, variants with `impressions` and `conversions`
- Compute conversion rate per variant
- Flag statistical significance (>100 conversions per variant minimum)

From `bs-meta-ads.json`:
- `summary`: `spend`, `impressions`, `clicks`, `conversions`, `roas`
- `campaigns[]`: per-campaign breakdown
- Compute: CTR (clicks/impressions), CPA (spend/conversions)

## Step 5: Compare Against Benchmarks

Target benchmarks (from growth playbook):

| Metric | Target |
|--------|--------|
| Homepage → Lead (email capture) | >15% |
| Lead → Initiate Checkout | >40% |
| Initiate Checkout → Purchase | >70% |
| Overall Visitor → Purchase | >4% |
| AOV | >$35 |
| Monthly Revenue (M1) | $5,000 |
| Monthly Revenue (M3) | $15,000 |

For each metric, compute the gap (actual - target) and flag as:
- **On track**: at or above target
- **Close**: within 20% of target
- **Gap**: more than 20% below target
- **No data**: insufficient events to compute

## Step 6: Generate Recommendations

Analyze all gaps and generate a ranked list of improvements. Use this priority logic:

### Priority 1 — No Traffic / Blocked Revenue
- If page_view count < 50 in period → **"Un-pause Meta campaign"** — $15/day budget is set, 3 creatives uploaded, audience configured (US SMB 25-55). Just toggle in Ads Manager
- If Meta ads `summary` is null or spend = 0 → **"Activate paid acquisition"** — no ad spend detected

### Priority 2 — Security / Trust Blockers
- Always include: **"Fix P1: Checkout trusts client-supplied amount"** — server must recalculate price from selected scene count via pricing tiers. Security vulnerability
- Always include: **"Fix double lead event"** — email-popup.tsx + home-client-wrapper.tsx both fire `lead`. Inflates funnel metrics

### Priority 3 — Funnel Gaps (largest drop-off first)
- Sort funnel stages by drop-off %. The stage with the biggest drop-off gets the first recommendation
- For each gap, provide specific actionable advice tied to growth-engine stories:
  - Low visitor→lead: "Optimize email capture timing, add social proof, test popup delay"
  - Low lead→checkout: "Add urgency/scarcity, improve scene preview quality, test pricing display"
  - Low checkout→purchase: "Build trust badges (growth-engine US-005), add checkout abandonment tracking, test coupon visibility"

### Priority 4 — Growth Levers (unbuilt features)
- If no email recovery sequence exists → **"Build lead recovery emails"** (growth-engine US-004) — 3-email sequence at T+1h, T+24h, T+72h for leads who didn't purchase
- If no retargeting pixel on logo upload → **"Add InitiateGeneration retargeting event"** (growth-engine US-003) — enables Meta retargeting audience of logo uploaders
- If AOV < $35 → **"Build team purchase flow"** (growth-engine US-006) — volume discounts (20% at 5+, 30% at 10+, 40% at 25+)

### Priority 5 — Optimization
- If A/B test has a statistically significant winner → **"Deploy winning variant"** for that test with expected lift %
- If Meta CPA > $10 → **"Refine Meta targeting"** — narrow audience, test new creatives, enable lookalike audiences
- If Meta ROAS < 2x → **"Pause underperforming campaigns"** — list which campaigns to pause vs scale

### Priority 6 — Tracking Gaps
- If sessionStorage loss on iOS → "Add server-side order lookup fallback for paid users on iOS Safari"
- If no Google Ads running → "Evaluate Google Ads launch once Meta CPA is optimized"

Tag each recommendation: `[HIGH]`, `[MED]`, or `[LOW]` based on expected revenue impact.

## Step 7: Output Report

Print the full report to the conversation in this format:

```
{company} Analytics — Last {DAYS} days (as of {YYYY-MM-DD})
══════════════════════════════════════════════════════════════

Revenue
───────
Total: ${revenue}  ({trend}% vs prior period)
Customers: {count}  |  Orders: {count}  |  AOV: ${aov}

Conversion Funnel
─────────────────
Stage                     Count    Conv %   Target   Status
─────────────────────────────────────────────────────────────
Visitors (page_view)      {n}      —        —        —
Leads (email captured)    {n}      {%}      15%      {status}
Initiated Checkout        {n}      {%}      40%      {status}
Purchased                 {n}      {%}      70%      {status}
─────────────────────────────────────────────────────────────
Overall                   —        {%}      4%       {status}

Meta Ads
────────
Spend: ${spend}  |  Impressions: {n}  |  Clicks: {n}
CTR: {%}  |  CPA: ${cpa}  |  ROAS: {x}x
{per-campaign breakdown if multiple}

Traffic Sources
───────────────
{source}: {visits} visits → {conversions} purchases ({conv %}%)
...

A/B Tests
─────────
{test_id}: {winner_variant} ({conv_rate}%) vs control ({control_rate}%)
  → {significant ? "WINNER — deploy for {lift}% lift" : "Insufficient data ({n} conversions)"}
...

Top 5 Styles: {style1} ({n}), {style2} ({n}), ...
Bottom 5 Styles: {style1} ({n}), {style2} ({n}), ...

Recommendations
════════════════
{numbered list with [HIGH/MED/LOW] tags, specific actions, and data backing}
```

## Step 8: Save Report Snapshot

Write the report as markdown to `workspace/reports/{company}-analytics-{YYYY-MM-DD}.md` for historical tracking. Include raw metric values in a YAML frontmatter block for programmatic comparison across snapshots.

## Rules

- **Company isolation**: Only use {company} credentials. Never fall back to another company's keys
- **Never expose secrets in output**: Redact API keys from any displayed curl commands
- **Graceful on empty data**: If a data source returns empty/null, note "No data" for that section instead of failing
- **Fire-and-forget**: If one API call fails, continue with available data. Note which source failed
- **No code changes**: This command only reads and reports. Never modify the codebase
- **Actionable recommendations**: Every recommendation must reference a specific action (un-pause campaign, build feature X, fix bug Y). No vague "consider improving conversion"
- **Growth-engine linkage**: When recommending unbuilt features, reference the specific growth-engine story ID (US-001 through US-006) so the user can run `/execute-task {company}-growth-engine/US-XXX`
