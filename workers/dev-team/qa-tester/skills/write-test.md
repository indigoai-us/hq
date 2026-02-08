# write-test

Write a new test for a feature or function. For E2E tests, requires a test-plan as input to ensure tests reflect real user behavior.

## Arguments

`$ARGUMENTS` = `--target <file|function>` (required for unit/integration) OR `--plan <path>` (required for E2E)

Optional:
- `--repo <path>` - Target repository
- `--type <unit|integration|e2e>` - Test type (default: inferred from target)
- `--flow <flow-id>` - Specific flow from test plan to implement (E2E only)
- `--template <name>` - Override template selection (E2E only)
- `--all-critical` - Implement all critical-path flows from test plan (E2E only)

## Process

### For Unit/Integration Tests

1. Analyze target code
2. Identify test cases
3. Generate test file
4. Add to test suite
5. Verify tests pass

### For E2E Tests (Requires Test Plan)

**IMPORTANT: E2E tests MUST be driven by a test plan.** Never write E2E tests without first running the `test-plan` skill or providing an existing test plan JSON file. Tests that don't reflect real user behavior are noise.

#### Step 1: Load Test Plan

```bash
# Test plan is required -- verify it exists
cat workspace/reports/dev-team/qa/{project}-test-plan.json | jq '.summary'
```

If no test plan exists, stop and run `test-plan` skill first:
```
/run qa-tester test-plan --project {project} --repo {repo}
```

#### Step 2: Select Flow(s) to Implement

If `--flow` is provided, implement that specific flow. If `--all-critical` is provided, implement all flows with `"type": "critical-path"`. Otherwise, prompt for which flow(s) to implement.

```bash
# List available flows
jq -r '.flows[] | "\(.id) [\(.type)] \(.priority) - \(.name)"' {test-plan.json}

# List critical-path flows only
jq -r '.flows[] | select(.type == "critical-path") | "\(.id) - \(.name)"' {test-plan.json}
```

#### Step 3: Select Template

Use the template assigned to the flow in the test plan. Templates are at `knowledge/testing/templates/`:

| Template | File | Use When |
|----------|------|----------|
| `nextjs-webapp` | `knowledge/testing/templates/nextjs-webapp.md` | Web UI interactions |
| `api-endpoints` | `knowledge/testing/templates/api-endpoints.md` | REST API testing |
| `cli-browser-oauth` | `knowledge/testing/templates/cli-browser-oauth.md` | CLI with browser OAuth |

#### Step 4: Generate Test Spec

For each flow, generate a Playwright spec file:

1. Read the flow specification from the test plan (steps, assertions, edge cases)
2. Read the assigned template for patterns and structure
3. Generate the spec file following template conventions
4. Place in appropriate directory: `tests/e2e/{category}/{flow-name}.spec.ts`
5. Include data-testid selectors where possible (prefer over CSS/XPath)
6. Add meaningful test descriptions that reference the user journey

#### Step 5: Update Manifest and Verify

```bash
# Rebuild manifest to include new tests
npm run generate-manifest

# Verify coverage
npm run check-coverage

# Run the new tests locally to verify they work
npm test tests/e2e/{category}/{flow-name}.spec.ts

# Commit updated manifest alongside spec changes
```

#### Step 6: Validate Against Test Plan

Cross-check the generated tests against the test plan:
- Every step in the flow has a corresponding test action
- Every assertion in the flow has a corresponding expect()
- Edge cases from the flow are captured as separate test cases or test.describe blocks
- Template patterns are correctly applied

## Output

### Unit/Integration Test Output

New test file with:
- Setup/teardown
- Happy path tests
- Edge cases
- Error handling tests

### E2E Test Output

For each implemented flow:

```
Flow: {flow-id} - {flow-name}
Template: {template-name}
Spec: tests/e2e/{category}/{flow-name}.spec.ts
Tests: {count} test cases ({happy-path} happy path, {edge-cases} edge cases)

Coverage:
  - Steps covered: {covered}/{total} from test plan
  - Assertions mapped: {mapped}/{total}
  - Edge cases: {implemented}/{total}
```

Summary:
```
Implemented: {N} flows from test plan
Test files: {list of created/updated files}
Total test cases: {count}
Manifest updated: yes
Local verification: passed/failed
```

## Integration with Other Skills

```
test-plan (discovery)
    |
    v
{project}-test-plan.json   <-- THIS IS REQUIRED INPUT
    |
    v
write-test --plan {test-plan.json} --flow flow-001   <-- THIS SKILL
    |
    v
tests/e2e/{category}/{flow-name}.spec.ts
    |
    v
run-tests --type e2e --mode ci   <-- Validate in CI
```

## Rules

- **Never write E2E tests without a test plan.** The plan is the foundation. If no plan exists, run `test-plan` skill first.
- Unit and integration tests can be written without a test plan (target code analysis is sufficient).
- Follow the assigned template patterns exactly -- templates encode best practices for each app type.
- Every E2E test must map to a real user journey from the test plan, not an implementation detail.
- Include the flow ID as a comment in each spec file for traceability: `// Flow: flow-001`
- After generating E2E specs, always run `npm run generate-manifest` and commit the updated manifest.
- Prefer data-testid selectors, then accessibility selectors (getByRole, getByLabel), then text selectors. Avoid CSS class selectors.
- Edge cases from the test plan should be separate test cases, not lumped into happy path tests.
- After writing tests, run them locally before committing. If they fail, fix them.
