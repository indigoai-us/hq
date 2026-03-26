---
description: Bootstrap a new knowledge domain — scaffold categories, seed entries, and queue curiosity items
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch
---

# /blueprint — Knowledge Domain Bootstrap

Given a domain or topic, generate a full knowledge bootstrap: categories, initial entries, and a prioritized curiosity queue for `/research` to fill in.

## Input

The user provides a domain description as the argument. Examples:
- `/blueprint Kubernetes networking`
- `/blueprint goclaw platform internals -c indigo`
- `/blueprint React Server Components`

If no argument is provided, ask the user what domain to bootstrap.

## Company Context

All knowledge is scoped to a company. Determine the target company:

1. If `$ARGUMENTS` contains `-c <slug>`, use that slug.
2. Otherwise default to `hq`.

Set `COMPANY` to the resolved slug.

## Procedure

### 1. Explore Existing Knowledge

Check what's already known:

```bash
qmd query "{domain}" -n 10 -c {COMPANY}
```

Note any existing categories, entries, and gaps. The blueprint should complement — not duplicate — what exists.

### 1b. Check Available Sources

Read `companies/manifest.yaml` and look at the `sources` list for `{COMPANY}`. Available sources inform:
- **What to seed**: If the company has Slack/Linear/GitHub, seed entries can reference internal tooling and workflows
- **What to queue**: Curiosity items should note which source to consult (e.g. "Check Slack #engineering for context on X")
- **Research strategy**: When `/research` processes queued items, it will use these sources automatically

### 2. Analyze the Domain

Think through the domain and identify:

- **3-5 sub-topics** that form natural knowledge categories
- **Key concepts** within each sub-topic that Claude already knows (these become seed entries)
- **Knowledge gaps** — questions Claude can't confidently answer (these become curiosity items)

For each sub-topic, determine:
- A slug-friendly category name (lowercase, hyphenated)
- A one-line description of what belongs there
- 1-2 seed entries Claude can write now from existing knowledge
- 2-3 research questions for things Claude doesn't know

### 3. Execute the Blueprint

#### a. Create category directories

For each identified category:

```bash
mkdir -p companies/{COMPANY}/knowledge/{category}
```

#### b. Write seed knowledge entries

For concepts Claude already knows with reasonable confidence, write stub entries:

```markdown
---
title: "{Concise Title}"
category: {category}
tags: ["{tag1}", "{tag2}", "{tag3}"]
source: blueprint
confidence: 0.5
created_at: {ISO 8601}
updated_at: {ISO 8601}
---

{1-3 paragraphs summarizing what Claude knows. Be honest about uncertainty. Mark speculative claims clearly.}
```

Rules for seed entries:
- **Confidence 0.5**: These are starting points, not authoritative. `/research` will upgrade them.
- **Source "blueprint"**: Marks these as generated, not researched.
- **Honest uncertainty**: Better to say "X is commonly used for Y, though specifics may vary" than to state uncertain facts as truth.
- **3-6 tags** following existing vocabulary. Run `./companies/hq/tools/tag-inventory.sh -c {COMPANY}` to check existing tags.
- **Dedup check**: Run `qmd vsearch "{title}" -n 1 -c {COMPANY}` before writing. Skip if similarity > 0.9.

#### c. Queue curiosity items

For each knowledge gap, queue a research item:

```bash
npx tsx companies/hq/tools/queue-curiosity.ts -c {COMPANY} \
  --question "{specific research question}" \
  --source knowledge_gap \
  --priority {6-8} \
  --context "Blueprint domain: {domain}. Gap identified during knowledge bootstrap."
```

Priority guidelines:
- **8**: Foundational concepts needed to understand the domain
- **7**: Important details that affect practical use
- **6**: Nice-to-know context, history, or edge cases

Aim for 5-8 curiosity items per blueprint.

#### d. Reindex

```bash
npx tsx companies/hq/tools/reindex.ts -c {COMPANY}
```

### 4. Report Summary

```
## Blueprint: {Domain} ({COMPANY})

Categories created:
- companies/{COMPANY}/knowledge/{category1}/ — {description}
- companies/{COMPANY}/knowledge/{category2}/ — {description}

Seed entries written:
- {title} → companies/{COMPANY}/knowledge/{category}/{slug}.md (confidence: 0.5)

Curiosity items queued ({N} items):
- [P8] {question}
- [P7] {question}
- [P6] {question}

Existing knowledge found:
- {title} (already known, skipped)

Next step: Run `/research -c {COMPANY}` to start filling in the gaps.
```

## Rules

- **Complement, don't duplicate**: Always check existing knowledge first.
- **Honesty over coverage**: Better to write 2 honest entries than 5 speculative ones.
- **Seed entries are stubs**: Confidence 0.5, source "blueprint". They exist to give `/research` something to upgrade.
- **Curiosity items drive learning**: The real value is the research queue, not the seed entries.
- **Follow existing format**: Frontmatter schema from `companies/hq/knowledge/meta/format-spec.md`. Tags from existing vocabulary.
- **Always reindex**: Run `npx tsx companies/hq/tools/reindex.ts -c {COMPANY}` after all writes.
- **Max scope**: Cap at 5 categories, 10 entries, 8 curiosity items per blueprint to stay focused.
