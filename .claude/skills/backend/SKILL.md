---
name: Backend Developer
description: API endpoints, business logic, and server-side integrations
---

# Backend Developer

API implementation, business logic, and server-side integrations.

## Process

### Phase 1: Understand the Contract

1. Read the architect's API contract (request/response/error shapes)
2. Read existing route files to understand the project's routing pattern
3. Identify the ORM, validation library, and error handling conventions
4. Check for existing middleware (auth, rate limiting, logging)

**Output:** Confirmed understanding of contract + tech stack.

**If no contract exists:** Ask the user or invoke the architect skill first.

### Phase 2: Implement

1. Create route/endpoint files following existing patterns
2. Implement service layer — business logic separate from route handlers
3. Add input validation at API boundaries
4. Implement error handling matching the project's error shape
5. Add middleware hooks (auth, logging) as needed

### Phase 3: Test

1. Write unit tests for service layer logic
2. Write integration tests for API endpoints (request in, response out)
3. Run the test suite — fix failures before completing

**Stopping criteria:** All new tests pass, no regressions in existing tests.

## Performance Patterns

| Priority | Pattern | How |
|----------|---------|-----|
| **CRITICAL** | Prevent waterfalls | `Promise.all()` for independent fetches — never chain sequential awaits |
| **HIGH** | Server Action auth | Authenticate Server Actions the same as API routes |
| **HIGH** | Caching | Cross-request LRU for expensive operations |
| **HIGH** | Non-blocking work | `after()` for post-response tasks (logging, notifications) |
| **HIGH** | Minimize serialization | At RSC boundaries, pass only what's needed |
| **MEDIUM** | Request dedup | `React.cache()` for per-request deduplication |

### Waterfall prevention

```typescript
// BAD — sequential, creates waterfall
const user = await getUser(id);
const orders = await getOrders(id);
const prefs = await getPreferences(id);

// GOOD — parallel, no waterfall
const [user, orders, prefs] = await Promise.all([
  getUser(id),
  getOrders(id),
  getPreferences(id),
]);
```

## Error Handling

```typescript
// Standard error response shape
interface ApiError {
  code: string;       // Machine-readable: 'NOT_FOUND', 'VALIDATION_ERROR'
  message: string;    // Human-readable description
  details?: unknown;  // Optional: validation errors, context
}
```

- Throw typed errors in service layer, catch and format in route handler
- Never swallow exceptions silently — log and return appropriate status
- Use HTTP status codes correctly: 400 (client error), 401 (unauthed),
  403 (forbidden), 404 (not found), 422 (validation), 500 (server error)

## Rules

### Implementation

- **Follow existing patterns**: Match the project's routing, naming, and file structure
- **TypeScript strict mode**: No implicit `any` — all inputs and outputs typed
- **Validate at boundaries**: All external input validated before processing
- **Separate concerns**: Route handlers delegate to service functions — no business logic in routes
- **Explicit error handling**: Every error path returns a typed error response

### Process

- **Show plan before coding**: Present implementation approach for approval
- **Surface breaking changes**: Flag any changes to existing API contracts
- **Justify new dependencies**: Explain why existing tools can't do the job

## Output

- Route/endpoint files with typed request and response
- Service layer with business logic
- Unit and integration tests
- Updated API documentation if applicable
