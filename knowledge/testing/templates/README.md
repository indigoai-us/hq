# E2E Testing Templates

Ready-to-use Playwright testing templates for common application patterns. Each template provides setup instructions, common patterns, and best practices.

## Quick Reference

| Template | Use When | Key Patterns |
|----------|----------|--------------|
| [nextjs-webapp.md](./nextjs-webapp.md) | Testing Next.js/React web applications | Page navigation, forms, interactive components, responsive design |
| [cli-browser-oauth.md](./cli-browser-oauth.md) | Testing CLI tools with browser-based OAuth | Process spawning, URL extraction, concurrent CLI+browser |
| [api-endpoints.md](./api-endpoints.md) | Testing REST APIs | CRUD operations, authentication, error handling, schema validation |

## When to Use Each Template

### Next.js Web App Template

Use this template when:
- Building a Next.js or React SPA/SSR application
- Testing user interactions (clicks, forms, navigation)
- Testing UI components (modals, accordions, dropdowns)
- Testing responsive layouts
- Testing page load and content rendering

Example projects: Landing pages, dashboards, e-commerce sites, SaaS applications.

### CLI Browser OAuth Template

Use this template when:
- Building a CLI tool that opens browser for authentication
- Testing OAuth/OIDC login flows triggered by CLI
- Testing tools like `gh auth`, `claude login`, `vercel login` patterns
- Need to coordinate between CLI process and browser automation

Example projects: CLI developer tools, authentication utilities, API clients.

### API Endpoints Template

Use this template when:
- Testing REST API endpoints directly (no browser needed)
- Validating API contracts and response schemas
- Testing authentication and authorization
- Testing error handling and validation
- Performance/load testing API responses

Example projects: Backend APIs, serverless functions, microservices.

## Combining Templates

Real applications often need multiple templates:

```
my-app/
├── tests/
│   └── e2e/
│       ├── tests/
│       │   ├── ui/              # nextjs-webapp patterns
│       │   │   ├── home.spec.ts
│       │   │   └── dashboard.spec.ts
│       │   ├── api/             # api-endpoints patterns
│       │   │   ├── users.spec.ts
│       │   │   └── auth.spec.ts
│       │   └── cli/             # cli-browser-oauth patterns
│       │       └── login.spec.ts
│       └── fixtures/
│           ├── browserbase.ts   # Cloud browser fixture
│           ├── api.ts           # API helper fixture
│           └── cli-auth.ts      # CLI auth fixture
```

## Infrastructure Requirements

All templates work with HQ's E2E testing infrastructure:

1. **Vercel Preview Deployments** - Every PR gets a preview URL
2. **GitHub Actions** - Runs tests automatically on push/PR
3. **Browserbase** - Cloud browser execution (optional, falls back to local)

See related docs:
- [Vercel Preview Deployments](../vercel-preview-deployments.md)
- [Browserbase Integration](../browserbase-integration.md)

## Quick Start

1. **Choose your template** based on the table above

2. **Copy the setup section** to your project:
   ```bash
   mkdir -p tests/e2e && cd tests/e2e
   npm init -y
   npm install -D @playwright/test
   ```

3. **Copy playwright.config.ts** from the template

4. **Start writing tests** following the patterns

5. **Run locally**:
   ```bash
   npm run test:local
   ```

6. **Run in CI**: Tests run automatically via GitHub Actions

## Best Practices

### DO

- Write tests that mirror real user behavior
- Use data-testid attributes for stable selectors
- Test both happy paths and error states
- Clean up test data after tests
- Use fixtures for common setup (auth, test data)

### DON'T

- Test implementation details (internal state, private methods)
- Rely on arbitrary timeouts (`page.waitForTimeout(5000)`)
- Share state between tests (tests should be independent)
- Skip error handling tests (they catch real bugs)
- Write flaky tests (fix root cause, don't add retries)

## Troubleshooting

### Tests pass locally but fail in CI

- Check BASE_URL is correct for preview deployment
- Increase timeouts for cloud execution
- Add `await page.waitForLoadState('networkidle')` for slow pages

### Tests are flaky

- Use explicit waits: `await expect(locator).toBeVisible()`
- Add assertions before interactions
- Check for race conditions in async operations

### Can't find elements

- Verify selectors in Playwright Inspector: `npm run test:debug`
- Use more specific selectors (data-testid, role, text)
- Check if element is in iframe or shadow DOM

## Contributing

When adding new patterns to templates:
1. Test the pattern in a real project first
2. Include setup, example code, and cleanup
3. Add troubleshooting tips for common issues
4. Update this README with when to use the pattern
