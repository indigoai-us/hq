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

