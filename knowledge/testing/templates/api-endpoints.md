# API Endpoints E2E Testing Template

Template for testing REST API endpoints using Playwright's request context. Tests API contracts, responses, and error handling without a browser.

## Prerequisites

- Playwright installed (`npm install -D @playwright/test`)
- API deployed (Vercel, local dev server, etc.)
- Test data seeding strategy (optional)

## Directory Structure

```
project/
├── tests/
│   └── e2e/
│       ├── playwright.config.ts
│       ├── fixtures/
│       │   └── api.ts            # API helper fixture
│       └── tests/
│           └── api/
│               ├── users.spec.ts
│               ├── posts.spec.ts
│               └── auth.spec.ts
```

## Setup

### 1. playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],
  timeout: 30000,
  use: {
    baseURL: process.env.API_URL || 'http://localhost:3000/api',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  outputDir: 'test-results/',
});
```

### 2. API Helper Fixture (fixtures/api.ts)

```typescript
import { test as base, APIRequestContext } from '@playwright/test';

interface ApiFixtures {
  api: APIRequestContext;
  authToken: string;
  testUser: { id: string; email: string };
}

export const test = base.extend<ApiFixtures>({
  api: async ({ request }, use) => {
    await use(request);
  },

  authToken: async ({ request }, use) => {
    // Login to get auth token
    const response = await request.post('/auth/login', {
      data: {
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        password: process.env.TEST_USER_PASSWORD || 'testpass',
      },
    });

    if (!response.ok()) {
      throw new Error('Failed to authenticate test user');
    }

    const { token } = await response.json();
    await use(token);
  },

  testUser: async ({ request, authToken }, use) => {
    // Get current user info
    const response = await request.get('/users/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const user = await response.json();
    await use(user);
  },
});

export { expect } from '@playwright/test';
```

## Common Patterns

### Basic CRUD Operations

```typescript
import { test, expect } from '../fixtures/api';

test.describe('Users API', () => {
  test.describe('GET /users', () => {
    test('returns list of users', async ({ request }) => {
      const response = await request.get('/users');

      expect(response.ok()).toBe(true);
      expect(response.status()).toBe(200);

      const users = await response.json();
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });

    test('supports pagination', async ({ request }) => {
      const response = await request.get('/users?page=1&limit=10');

      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.users).toBeDefined();
      expect(data.total).toBeDefined();
      expect(data.page).toBe(1);
      expect(data.users.length).toBeLessThanOrEqual(10);
    });
  });

  test.describe('GET /users/:id', () => {
    test('returns single user', async ({ request, testUser }) => {
      const response = await request.get(`/users/${testUser.id}`);

      expect(response.ok()).toBe(true);

      const user = await response.json();
      expect(user.id).toBe(testUser.id);
      expect(user.email).toBe(testUser.email);
    });

    test('returns 404 for non-existent user', async ({ request }) => {
      const response = await request.get('/users/non-existent-id');

      expect(response.status()).toBe(404);

      const error = await response.json();
      expect(error.message).toContain('not found');
    });
  });

  test.describe('POST /users', () => {
    test('creates new user', async ({ request, authToken }) => {
      const newUser = {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        password: 'testpass123',
      };

      const response = await request.post('/users', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: newUser,
      });

      expect(response.status()).toBe(201);

      const created = await response.json();
      expect(created.id).toBeDefined();
      expect(created.email).toBe(newUser.email);
      expect(created.password).toBeUndefined(); // Password not returned
    });

    test('validates required fields', async ({ request, authToken }) => {
      const response = await request.post('/users', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { name: 'Missing Email' },
      });

      expect(response.status()).toBe(400);

      const error = await response.json();
      expect(error.errors).toBeDefined();
      expect(error.errors.email).toBeDefined();
    });
  });

  test.describe('PUT /users/:id', () => {
    test('updates existing user', async ({ request, authToken, testUser }) => {
      const response = await request.put(`/users/${testUser.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { name: 'Updated Name' },
      });

      expect(response.ok()).toBe(true);

      const updated = await response.json();
      expect(updated.name).toBe('Updated Name');
    });
  });

  test.describe('DELETE /users/:id', () => {
    test('deletes user', async ({ request, authToken }) => {
      // Create user to delete
      const createResponse = await request.post('/users', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          email: `delete-me-${Date.now()}@example.com`,
          name: 'Delete Me',
          password: 'testpass',
        },
      });
      const { id } = await createResponse.json();

      // Delete user
      const deleteResponse = await request.delete(`/users/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(deleteResponse.status()).toBe(204);

      // Verify deleted
      const getResponse = await request.get(`/users/${id}`);
      expect(getResponse.status()).toBe(404);
    });
  });
});
```

### Authentication Testing

```typescript
test.describe('Auth API', () => {
  test.describe('POST /auth/login', () => {
    test('returns token for valid credentials', async ({ request }) => {
      const response = await request.post('/auth/login', {
        data: {
          email: 'test@example.com',
          password: 'testpass',
        },
      });

      expect(response.ok()).toBe(true);

      const { token, user } = await response.json();
      expect(token).toBeDefined();
      expect(user.email).toBe('test@example.com');
    });

    test('returns 401 for invalid credentials', async ({ request }) => {
      const response = await request.post('/auth/login', {
        data: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.status()).toBe(401);

      const error = await response.json();
      expect(error.message).toContain('Invalid');
    });
  });

  test.describe('Protected routes', () => {
    test('returns 401 without token', async ({ request }) => {
      const response = await request.get('/users/me');
      expect(response.status()).toBe(401);
    });

    test('returns 401 with invalid token', async ({ request }) => {
      const response = await request.get('/users/me', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(response.status()).toBe(401);
    });

    test('returns 403 for insufficient permissions', async ({ request, authToken }) => {
      // Assuming testUser is not admin
      const response = await request.delete('/admin/users/123', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(response.status()).toBe(403);
    });
  });
});
```

### Response Schema Validation

```typescript
test('response matches schema', async ({ request }) => {
  const response = await request.get('/users/1');
  const user = await response.json();

  // Validate required fields
  expect(user).toHaveProperty('id');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('createdAt');

  // Validate types
  expect(typeof user.id).toBe('string');
  expect(typeof user.email).toBe('string');
  expect(new Date(user.createdAt).toString()).not.toBe('Invalid Date');

  // Validate sensitive fields are not exposed
  expect(user).not.toHaveProperty('password');
  expect(user).not.toHaveProperty('passwordHash');
});
```

### Error Response Testing

```typescript
test.describe('Error Handling', () => {
  test('returns proper error format', async ({ request }) => {
    const response = await request.get('/users/invalid-id');

    const error = await response.json();

    // Standard error format
    expect(error).toHaveProperty('message');
    expect(error).toHaveProperty('code');
    expect(typeof error.message).toBe('string');
  });

  test('handles malformed JSON', async ({ request }) => {
    const response = await request.post('/users', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not-valid-json',
    });

    expect(response.status()).toBe(400);
  });

  test('handles missing content-type', async ({ request }) => {
    const response = await request.post('/users', {
      headers: { 'Content-Type': '' },
      data: { email: 'test@example.com' },
    });

    // Should either work or return appropriate error
    expect([200, 201, 400, 415]).toContain(response.status());
  });
});
```

### Rate Limiting Testing

```typescript
test.describe('Rate Limiting', () => {
  test('enforces rate limits', async ({ request }) => {
    const requests = Array(100).fill(null).map(() =>
      request.get('/users')
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status() === 429);

    // Should have some rate limited responses
    expect(rateLimited.length).toBeGreaterThan(0);

    // Check rate limit headers
    const limitedResponse = rateLimited[0];
    expect(limitedResponse.headers()['retry-after']).toBeDefined();
  });
});
```

### File Upload Testing

```typescript
test.describe('File Upload', () => {
  test('uploads file successfully', async ({ request, authToken }) => {
    const response = await request.post('/uploads', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Hello, World!'),
        },
      },
    });

    expect(response.status()).toBe(201);

    const { url } = await response.json();
    expect(url).toMatch(/^https?:\/\//);
  });

  test('rejects invalid file type', async ({ request, authToken }) => {
    const response = await request.post('/uploads', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        file: {
          name: 'malware.exe',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from('fake executable'),
        },
      },
    });

    expect(response.status()).toBe(400);
  });
});
```

### Testing with Database Seeding

```typescript
test.describe('With Seeded Data', () => {
  let testPostId: string;

  test.beforeAll(async ({ request }) => {
    // Seed test data
    const response = await request.post('/test/seed', {
      data: {
        posts: [
          { title: 'Test Post 1', content: 'Content 1' },
          { title: 'Test Post 2', content: 'Content 2' },
        ],
      },
    });
    const { posts } = await response.json();
    testPostId = posts[0].id;
  });

  test.afterAll(async ({ request }) => {
    // Clean up test data
    await request.post('/test/cleanup');
  });

  test('can query seeded posts', async ({ request }) => {
    const response = await request.get(`/posts/${testPostId}`);
    expect(response.ok()).toBe(true);

    const post = await response.json();
    expect(post.title).toBe('Test Post 1');
  });
});
```

## Assertions Cheatsheet

```typescript
// Status codes
expect(response.status()).toBe(200);
expect(response.ok()).toBe(true);  // 2xx

// Headers
expect(response.headers()['content-type']).toContain('application/json');
expect(response.headers()['cache-control']).toBeDefined();

// Body
const body = await response.json();
expect(body).toEqual({ id: 1, name: 'Test' });
expect(body).toMatchObject({ id: 1 });
expect(body.items).toHaveLength(5);

// Response time (for performance testing)
const start = Date.now();
await request.get('/users');
expect(Date.now() - start).toBeLessThan(500);
```

## Cleanup

```typescript
test.afterEach(async ({ request, authToken }) => {
  // Clean up created resources if needed
  // Usually handled by test database reset
});

test.afterAll(async ({ request }) => {
  // Reset test state
  await request.post('/test/reset');
});
```

## CI Integration

```yaml
# .github/workflows/e2e.yml
- name: Run API tests
  env:
    API_URL: https://preview-abc.vercel.app/api
    TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
  run: npm test -- --grep "@api"
```

## Tips

1. **Use fixtures for auth tokens** - Don't repeat login logic in every test
2. **Test both happy path and errors** - APIs should gracefully handle bad input
3. **Validate response schemas** - Catch breaking changes early
4. **Clean up test data** - Avoid test pollution
5. **Test rate limits carefully** - May need separate test run or mocking

## Related

- [Next.js WebApp Template](./nextjs-webapp.md)
- [CLI Browser OAuth Template](./cli-browser-oauth.md)
- [Browserbase Integration](../browserbase-integration.md)
