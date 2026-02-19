# media-alert

Write short-form media advisory for events or demos.

## Inputs

- `company` (required): Company name
- `event` (required): Event or demo details
- `date` (required): Event date
- `location` (optional): Venue or "virtual"

## Steps

1. **Load context**
   - Load template: `knowledge/public/pr/templates/media-alert-template.md`
   - Read `companies/{company}/knowledge/` for brand context

2. **Draft media alert**
   Output to `workspace/pr-drafts/{company}/{date}-media-alert-{slug}.md`:

```markdown
# MEDIA ALERT

## {Headline — WHO + WHAT + WHEN}

**WHAT:** {One sentence description of the event/demo/announcement}

**WHEN:** {Date, time, timezone}

**WHERE:** {Location or "Virtual — registration link: {URL}"}

**WHO:** {Key speakers/participants with titles}

**WHY:** {1-2 sentences on why this matters to journalists — the news hook}

**VISUALS:** {What photo/video opportunities are available}

**RSVP:** {Contact info for media attendance}
hello@{company-6}pr.com | {Company-6} PR

## About {Company}
{Boilerplate from company knowledge}
```

## Rules

- Under 200 words — this is a quick-hit advisory, not a press release
- WHO/WHAT/WHEN/WHERE/WHY format strictly
- Include visual opportunity description (editors need this)
- Send 5-7 days before event, follow up 2 days before
