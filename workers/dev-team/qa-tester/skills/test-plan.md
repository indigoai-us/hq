# test-plan

Generate a prioritized, user-behavior-driven E2E test plan through structured discovery interviews with PMs, engineers, or (as fallback) automated analysis of the application.

This is the critical first step before writing any E2E tests. Tests that don't reflect real user behavior are noise. This skill ensures every test corresponds to something a real user actually does.

## Arguments

`$ARGUMENTS` = `--project <name>` (required)

Optional:
- `--repo <path>` - Target repository path
- `--url <base-url>` - Deployed application URL (for automated discovery fallback)
- `--mode <interview|analyze|hybrid>` - Discovery mode (default: `interview`)
- `--interviewee <name>` - Person being interviewed (PM, engineer, founder)
- `--output <path>` - Output path for test plan JSON (default: `workspace/reports/dev-team/qa/{project}-test-plan.json`)

## Overview

Most E2E test suites fail not because of bad test code, but because they test the wrong things. They click every button, verify every heading, and check every pixel -- but miss the checkout flow that generates 80% of revenue, or the edge case in the OAuth flow that breaks for 5% of users every Tuesday.

This skill fixes that by front-loading user-pattern discovery: learning what real users actually do, what breaks, and what matters before a single test is written.

## Process

### Phase 1: Discovery

Choose the appropriate discovery method based on available resources.

#### Mode A: Structured Interview (preferred)

Conduct a structured interview with someone who knows the application. This is an interactive conversation, not a form. Ask follow-up questions. Dig into specifics.

**Opening Context:**

> "I'm building an E2E test suite for {project}. I want to make sure we test what actually matters to users and the business, not just click every button. I'd like to understand the real user patterns so we can write tests that catch real bugs."

**Interview Questions:**

##### 1. Core User Journeys
- "What are the top 5 things users do on this application?"
- "Walk me through the most common user session from landing to completion."
- "What does a first-time user do vs. a returning user?"
- "What percentage of users reach each step?" (funnel awareness)

##### 2. Revenue and Business-Critical Paths
- "What user actions directly generate revenue or critical business value?"
- "If one flow broke right now and you couldn't fix it for 24 hours, which would cost the most money/users/reputation?"
- "What are the conversion paths? (signup -> trial -> paid, visitor -> lead -> customer, etc.)"
- "Are there any flows that trigger external integrations (payments, emails, webhooks) that are especially important?"

##### 3. Known Fragile Flows
- "What has broken before and caused user complaints or support tickets?"
- "Which parts of the app do you deploy changes to most cautiously?"
- "Are there any flows that are known to be flaky or fragile?"
- "What was the last production incident? What user flow was affected?"
- "Which browsers or devices have historically caused issues?"

##### 4. Edge Cases and Power User Patterns
- "What edge cases do power users encounter?"
- "What happens when a user has thousands of items/records? Does pagination or performance degrade?"
- "What do users do that surprises you? Any unexpected usage patterns?"
- "What inputs or states trigger corner cases? (empty states, max-length inputs, special characters, concurrent sessions)"

##### 5. Minimum Viable User Journey
- "What is the absolute minimum path a user must complete for the product to deliver value?"
- "If you could only test 3 things, what would they be?"
- "What would you check manually after every deploy if you had 60 seconds?"

##### 6. Technical Context
- "Is this a server-rendered app (Next.js SSR/SSG), SPA, or API-driven?"
- "What authentication method is used? (OAuth, magic link, password, SSO)"
- "Are there any third-party integrations that affect user flows? (Stripe, auth providers, analytics)"
- "What's the deployment model? (Vercel preview, Docker, custom CI)"
- "Are there feature flags that change user experience?"

##### 7. Existing Test Coverage
- "Do you have any existing tests? (unit, integration, E2E)"
- "What's currently NOT tested that worries you?"
- "Have you ever had a regression that existing tests missed? What was it?"

**Interview Technique:**
- Ask one question at a time. Wait for the full answer.
- Follow up on anything specific: "You mentioned the checkout flow breaks -- can you walk me through the exact steps?"
- Quantify when possible: "Roughly how many users hit this flow per day?"
- Note emotional responses -- if someone says "that page terrifies me", that's a high-priority test target.

#### Mode B: Automated Analysis (fallback)

When no human is available for interview, infer user patterns from the application itself. This produces a lower-confidence test plan that should be validated later.

**Step 1: Analyze UI Structure**
- Crawl the deployed URL or inspect the repo source for routes/pages
- Identify navigation structure (sitemap, nav menus, footer links)
- Catalog all forms, CTAs, and interactive elements
- Identify authenticated vs. public routes

**Step 2: Analyze Source Code**
- Scan for route definitions (`pages/`, `app/`, route configs)
- Identify API endpoints and their consumers
- Find form submissions and their validation logic
- Look for error boundaries, error handling, and fallback UIs
- Identify third-party integrations (payment, auth, analytics SDKs)

**Step 3: Analyze Analytics (if available)**
- Check for analytics instrumentation (track calls, event names)
- Identify which events suggest critical flows (purchase, signup, etc.)
- Look for funnel definitions in analytics config

**Step 4: Review Support/Issue History (if available)**
- Search GitHub issues for keywords: "bug", "broken", "regression", "users report"
- Review recent PRs for hotfixes and emergency changes
- Check for any monitoring/alerting configurations

**Step 5: Infer Priorities**
- Pages linked from homepage/landing = likely high traffic
- Flows involving payment/auth = likely business critical
- Complex multi-step flows = likely fragile
- Pages with heavy client-side JS = likely have edge cases

Mark all inferred flows with `"confidence": "inferred"` in the output.

#### Mode C: Hybrid

Run automated analysis first, then validate and supplement with a shorter interview:
- "I analyzed the app and found these appear to be the main flows: {list}. Does that match reality?"
- "Are there any critical paths I missed?"
- "Which of these would you prioritize?"

### Phase 2: Classification

Classify every discovered flow into one of two categories:

#### Critical Path Tests
- **Definition:** If this test fails, deployment should be blocked. Something users depend on is broken.
- **Examples:** Login, core product action, checkout/payment, signup, primary navigation
- **Rule:** Should cover the minimum viable user journey. If these all pass, the product is fundamentally usable.
- **Target:** 5-15 tests maximum. If you have more, you're not being selective enough.

#### Coverage Tests
- **Definition:** Important to verify but not deployment-blocking. Degraded experience, not broken product.
- **Examples:** Secondary pages, cosmetic elements, edge case handling, responsive layout, performance benchmarks
- **Rule:** Nice to have. Run them, report failures, but don't block deploys.
- **Target:** 15-50 tests depending on application size.

### Phase 3: Flow Specification

For each discovered flow, produce a structured specification:

```
Flow: {name}
Priority: critical | high | medium | low
Type: critical-path | coverage
Source: interview | inferred | analytics
Confidence: high | medium | low
User Journey: {1-2 sentence description of what the user is trying to accomplish}
Preconditions: {what must be true before this flow starts}
Steps:
  1. {action} -> {expected result}
  2. {action} -> {expected result}
  ...
Assertions:
  - {what to verify at the end}
  - {business rule to check}
Edge Cases:
  - {variant that should also be tested}
Template: nextjs-webapp | api-endpoints | cli-browser-oauth
Estimated Complexity: simple | moderate | complex
```

### Phase 4: Coverage Matrix

Build a coverage matrix that maps which user stories/requirements each test covers:

| Flow | Auth | Navigation | Forms | Payments | API | Mobile | Accessibility |
|------|------|-----------|-------|----------|-----|--------|--------------|
| Login | X | | X | | X | X | X |
| Checkout | X | X | X | X | X | X | |
| ... | | | | | | | |

This reveals coverage gaps: if no flow exercises "Mobile" or "Accessibility", those are blind spots.

### Phase 5: Output Generation

Generate the machine-parseable test plan document.

## Output Format

The test plan is output as JSON for machine consumption by other skills (especially `write-test`):

```json
{
  "project": "project-name",
  "version": "1.0",
  "generatedAt": "2025-01-15T10:30:00Z",
  "discoveryMode": "interview|analyze|hybrid",
  "interviewee": "Name (Role)",
  "interviewDate": "2025-01-15",
  "summary": {
    "totalFlows": 18,
    "criticalPath": 7,
    "coverage": 11,
    "estimatedTestCount": 45,
    "templateBreakdown": {
      "nextjs-webapp": 12,
      "api-endpoints": 5,
      "cli-browser-oauth": 1
    }
  },
  "flows": [
    {
      "id": "flow-001",
      "name": "User Signup",
      "priority": "critical",
      "type": "critical-path",
      "source": "interview",
      "confidence": "high",
      "userJourney": "New visitor signs up for an account to access the product",
      "preconditions": [
        "User is not logged in",
        "Signup is enabled (no invite-only mode)"
      ],
      "steps": [
        "Navigate to /signup",
        "Fill in email, password, and name fields",
        "Click 'Create Account' button",
        "Verify redirect to onboarding or dashboard",
        "Verify welcome email is triggered (check API or mock)"
      ],
      "assertions": [
        "User is redirected to /onboarding or /dashboard after signup",
        "User session is created (auth cookie or token present)",
        "User appears in the database (verify via API if possible)",
        "Invalid inputs show appropriate error messages"
      ],
      "edgeCases": [
        "Duplicate email address",
        "Password too short or missing special characters",
        "Email with plus addressing (user+test@example.com)",
        "Signup with OAuth provider instead of email"
      ],
      "template": "nextjs-webapp",
      "estimatedComplexity": "moderate",
      "relatedFlows": ["flow-002", "flow-003"]
    }
  ],
  "coverageMatrix": {
    "categories": ["auth", "navigation", "forms", "payments", "api", "mobile", "accessibility", "error-handling"],
    "mapping": {
      "flow-001": ["auth", "forms", "api", "error-handling"],
      "flow-002": ["auth", "navigation", "api"]
    },
    "gaps": [
      {
        "category": "mobile",
        "coveredBy": [],
        "recommendation": "Add responsive tests for critical flows"
      }
    ]
  },
  "testExecutionOrder": {
    "smoke": ["flow-001", "flow-003"],
    "critical": ["flow-001", "flow-002", "flow-003", "flow-004"],
    "full": ["flow-001", "flow-002", "flow-003", "flow-004", "flow-005", "flow-006"]
  },
  "metadata": {
    "knownFragileAreas": [
      {
        "area": "Checkout flow on Safari",
        "details": "Stripe Elements has known rendering issues on Safari < 16",
        "lastIncident": "2024-12-01"
      }
    ],
    "thirdPartyDependencies": [
      {
        "service": "Stripe",
        "affectedFlows": ["flow-005"],
        "testStrategy": "Use Stripe test mode with test cards"
      }
    ],
    "environmentRequirements": {
      "envVars": ["BASE_URL", "TEST_USER_EMAIL", "TEST_USER_PASSWORD"],
      "services": ["Database seeded with test data"],
      "credentials": ["Stripe test API key", "OAuth test app credentials"]
    }
  }
}
```

## Template Reference

When assigning templates to flows, use the testing templates at `knowledge/testing/templates/`:

| Template | File | Use When |
|----------|------|----------|
| `nextjs-webapp` | `knowledge/testing/templates/nextjs-webapp.md` | Web UI interactions: pages, forms, navigation, components, responsive |
| `api-endpoints` | `knowledge/testing/templates/api-endpoints.md` | REST API testing: CRUD, auth, validation, error handling |
| `cli-browser-oauth` | `knowledge/testing/templates/cli-browser-oauth.md` | CLI tools with browser-based OAuth flows |

Assign the template that best matches each flow's primary interaction pattern. A single flow can reference multiple templates if it spans UI and API interactions.

## Integration with Other Skills

This test plan is designed to be consumed by:

- **`write-test`** - Reads the test plan JSON and generates Playwright spec files for each flow, using the assigned template's patterns.
- **`run-tests`** - Uses `testExecutionOrder` to run smoke/critical/full suites.
- **`check-coverage`** - Uses `coverageMatrix` to identify untested areas.

### Workflow

```
test-plan (this skill)
    |
    v
{project}-test-plan.json
    |
    ├──> write-test --plan {test-plan.json} --flow flow-001
    ├──> write-test --plan {test-plan.json} --flow flow-002
    └──> ...
         |
         v
    Playwright spec files
         |
         v
    run-tests --suite critical
```

## Examples

### Example: SaaS Dashboard

Interview with PM reveals:
1. "Users log in, go to dashboard, check metrics" -> critical-path
2. "Admin users manage team members" -> high priority coverage
3. "The billing page broke last month and we lost 3 customers" -> critical-path
4. "Some users export CSV reports daily" -> medium priority coverage
5. "Mobile users mostly just check the dashboard" -> coverage (mobile-specific)

Resulting test plan has 7 critical-path tests (login, dashboard load, key metric display, billing page, payment update, team invite, core API health) and 12 coverage tests.

### Example: Developer CLI Tool

Interview with lead engineer reveals:
1. "`cli login` opens browser for OAuth" -> critical-path, cli-browser-oauth template
2. "`cli deploy` pushes to production" -> critical-path, api-endpoints template
3. "`cli status` shows deployment status" -> high priority coverage
4. "Token refresh breaks when the token is exactly expired" -> critical-path edge case
5. "Users with special chars in project names hit bugs" -> coverage edge case

### Example: Marketing Landing Page

Automated analysis infers:
1. Homepage loads with hero, nav, and CTA -> critical-path (inferred, high confidence)
2. CTA links to signup/demo -> critical-path (inferred, high confidence)
3. FAQ accordion expands/collapses -> coverage (inferred, medium confidence)
4. Contact form submits -> high priority (inferred, medium confidence)
5. Mobile responsive layout -> coverage (inferred, medium confidence)

All marked `"source": "inferred"` -- should be validated with interview when possible.

## Quality Checklist

Before finalizing the test plan, verify:

- [ ] Every critical-path flow maps to a real user action, not an implementation detail
- [ ] The minimum viable user journey is fully covered by critical-path tests
- [ ] No more than 15 critical-path tests (be ruthless about priorities)
- [ ] Every flow has at least one assertion tied to user-visible behavior
- [ ] Edge cases from interview are captured, not just happy paths
- [ ] Coverage matrix has no completely empty columns (no blind spots)
- [ ] Template assignments match the flow's interaction pattern
- [ ] Third-party dependencies are documented with test strategies
- [ ] Environment requirements are specified so tests can actually run
- [ ] Inferred flows are clearly marked with confidence levels

## Rules

- Never write tests without a test plan. The plan is the foundation.
- Interview mode always produces higher quality plans than analyze mode. Prefer it.
- If the interviewee says "everything is important", push back. Everything cannot be critical-path.
- A test plan with more than 15 critical-path tests is unfocused. Consolidate or demote.
- Always ask about what has broken before. Past incidents are the best predictor of future failures.
- Include edge cases even if they seem unlikely. Users will find them.
- The test plan is a living document. Update it after incidents, feature launches, and user feedback.
- When in doubt about priority, ask: "If this flow is broken, do users complain within 1 hour?" If yes, it's critical-path.
