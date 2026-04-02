---
description: Pull HQ growth metrics — npm downloads, GitHub stars, content impressions — into a visual dashboard
allowed-tools: Bash, Read, Write, WebFetch
argument-hint: [--refresh]
visibility: public
---

# /hq-growth-dashboard — HQ Growth Metrics

Pull live metrics for HQ's 90-day growth sprint and generate a visual HTML dashboard.

**Input:** $ARGUMENTS

## Step 1: Collect Metrics

Run these data-fetching commands in parallel (all are read-only, safe to batch):

### 1a. npm Downloads
```bash
# Weekly downloads for create-hq
curl -s "https://api.npmjs.org/downloads/point/last-week/create-hq" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'weekly:{d.get(\"downloads\",0)}')"

# Monthly downloads
curl -s "https://api.npmjs.org/downloads/point/last-month/create-hq" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'monthly:{d.get(\"downloads\",0)}')"

# Daily breakdown (last 30 days) for sparkline
curl -s "https://api.npmjs.org/downloads/range/last-month/create-hq" | python3 -c "
import sys,json
d=json.load(sys.stdin)
days=d.get('downloads',[])
print(','.join(str(x['downloads']) for x in days))
"
```

### 1b. GitHub Stats
```bash
# Stars, forks, watchers, open issues for {company}ai-us/hq
gh api repos/{company}ai-us/hq --jq '{stars: .stargazers_count, forks: .forks_count, watchers: .subscribers_count, open_issues: .open_issues_count}'

# Star history (recent stargazers — up to 30)
gh api repos/{company}ai-us/hq/stargazers -H "Accept: application/vnd.github.star+json" --jq '.[].starred_at' 2>/dev/null | tail -30

# Open PRs count
gh api repos/{company}ai-us/hq/pulls --jq 'length'

# Contributors count
gh api repos/{company}ai-us/hq/contributors --jq 'length'
```

Also fetch stats for hq-starter-kit (the repo users actually clone):
```bash
gh api repos/{your-name}/hq-starter-kit --jq '{stars: .stargazers_count, forks: .forks_count, watchers: .subscribers_count}' 2>/dev/null
```

### 1c. npm Package Version
```bash
npm view create-hq version 2>/dev/null
npm view create-hq time --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); versions=sorted(d.items(), key=lambda x:x[1], reverse=True)[:5]; [print(f'{v[0]}: {v[1]}') for v in versions]"
```

### 1d. Content Metrics (Manual — read from cache if exists)
Read `companies/{company}/data/campaigns/hq-launch/metrics-cache.json` if it exists.
If not, use placeholder values and note "manual update needed" in dashboard.

Content metrics include:
- Twitter impressions (total across HQ-related tweets)
- YouTube views (demo video)
- Reddit upvotes (r/ClaudeAI posts)
- HN points (if launched)
- Blog pageviews

### 1e. Revenue (if Stripe connected)
Read `companies/{company}/settings/stripe/` — if credentials exist, fetch MRR.
If not, show $0 with "Stripe not connected" note.
Never error on missing revenue data — it's expected early in the sprint.

## Step 2: Compute Sprint Status

Calculate derived metrics:
- **Sprint day:** Days since March 31, 2026 (sprint start)
- **Phase:** Day 1-21 = Ignition, Day 22-56 = Activation, Day 57-90 = Revenue
- **Target pace:** Compare actuals to linear interpolation of 90-day targets

Targets (from growth plan):
| Metric | Day 90 Target |
|--------|--------------|
| GitHub stars (both repos combined) | 200 |
| npm installs (monthly) | 500 |
| Active HQ instances | 20 |
| Content impressions | 100,000 |
| Revenue MRR | $5,000 |
| Contributors | 5 |

## Step 3: Generate HTML Dashboard

Write a self-contained HTML file to `workspace/reports/hq-growth-dashboard.html`.

Design guidelines:
- Dark theme (matches terminal aesthetic)
- Color palette: `#0f172a` background, `#22d3ee` accent (cyan), `#f472b6` secondary (pink), `#a3e635` success (lime)
- Use CSS Grid for metric cards
- Sparkline charts using inline SVG (no external libs)
- Progress bars showing % to 90-day target
- Phase indicator banner at top (Ignition / Activation / Revenue)
- Timestamp of last refresh

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  HQ GROWTH DASHBOARD          Day {N}/90 — {Phase}      │
│  Last updated: {timestamp}                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ GitHub   │  │ npm      │  │ Content  │  │ Revenue │ │
│  │ ★ {N}    │  │ ↓ {N}/wk │  │ 👁 {N}   │  │ ${N}/mo │ │
│  │ ████░░░  │  │ ████░░░  │  │ ████░░░  │  │ ████░░░ │ │
│  │ {%} of   │  │ {%} of   │  │ {%} of   │  │ {%} of  │ │
│  │ 200 goal │  │ 500 goal │  │ 100k     │  │ $5k     │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                          │
│  npm Downloads (30 days)                                 │
│  ▁▂▃▅▇█▇▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅▇█▇▅▃   (sparkline)         │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │ Repos            │  │ Milestones       │             │
│  │ hq: ★{N} 🍴{N}  │  │ ☐ Demo video     │             │
│  │ starter: ★{N}    │  │ ☐ 3 content pcs  │             │
│  │ ralph: ★{N}      │  │ ☐ HN launch      │             │
│  │ companion: ★{N}  │  │ ☐ PH launch      │             │
│  │ PRs open: {N}    │  │ ☐ Discord setup   │             │
│  │ Contributors: {N}│  │ ☐ Pkg ecosystem   │             │
│  └──────────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Milestone Checklist

Hard-code these milestones. Mark as complete (☑) if evidence exists:

| Milestone | Check |
|-----------|-------|
| Demo video recorded | File exists: `companies/{company}/data/campaigns/hq-launch/demo-video.*` |
| 3 content pieces published | File exists: `companies/{company}/data/campaigns/hq-launch/published-posts.json` |
| HN launch | `companies/{company}/data/campaigns/hq-launch/hn-post-url.txt` exists |
| Product Hunt launch | `companies/{company}/data/campaigns/hq-launch/ph-url.txt` exists |
| Discord server | `companies/{company}/data/campaigns/hq-launch/discord-invite.txt` exists |
| Package ecosystem merged | Check if `repos/public/hq` main branch has `hq install` command (grep for it) |
| First external contributor | GitHub API: contributors count > 3 ({your-name} + {team-member} + hassaans = 3) |

## Step 4: Open Dashboard

```bash
open workspace/reports/hq-growth-dashboard.html
```

If `$ARGUMENTS` contains `--refresh`, skip opening the browser — just regenerate the file and print summary to terminal.

## Step 5: Print Summary

After generating, print a concise terminal summary:

```
HQ Growth Sprint — Day {N}/90 ({Phase})
────────────────────────────
★ GitHub stars:  {N}/200 ({%})
↓ npm installs:  {N}/500 ({%})
$ Revenue MRR:   ${N}/$5k ({%})
👥 Contributors: {N}/5 ({%})

Next milestone: {highest-priority unchecked milestone}
Dashboard: workspace/reports/hq-growth-dashboard.html
```
