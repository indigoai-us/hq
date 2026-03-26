---
id: anthropic-sdk-vercel-bundling
title: Add @anthropic-ai/sdk to serverExternalPackages on Vercel
scope: global
trigger: anthropic sdk, vercel deploy, next.config
enforcement: soft
created: 2026-03-18
---

## Rule

When deploying a Next.js app that uses `@anthropic-ai/sdk` to Vercel, add it to `serverExternalPackages` in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['@anthropic-ai/sdk'],
  // ...
};
```

## Rationale

**Why:** Next.js Turbopack bundles server-side dependencies by default. The Anthropic SDK's HTTP client can break when bundled — its internal fetch/node-http usage doesn't survive the transformation. `serverExternalPackages` tells Next.js to load the package directly from `node_modules` at runtime.

**How to apply:** Any Next.js project on Vercel that imports `@anthropic-ai/sdk` in API routes or server components. Check `next.config.ts` during project setup or when adding Anthropic SDK as a dependency.
