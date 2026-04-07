---
id: hq-github-review-thread-resolution
title: Resolve GitHub PR review threads via GraphQL
scope: global
trigger: landing PRs, resolving review comments, merge blocks from unresolved threads
enforcement: soft
version: 1
created: 2026-04-03
updated: 2026-04-03
source: success-pattern
---

## Rule

- GitHub REST API has no endpoint for resolving PR review threads. Use the **GraphQL `resolveReviewThread` mutation** instead.
- To get thread IDs: query `repository.pullRequest.reviewThreads` via GraphQL — each thread has a node `id` and `isResolved` boolean.
- To resolve: `mutation { resolveReviewThread(input: {threadId: "{id}"}) { thread { isResolved } } }`
- Batch resolution: loop over thread IDs with sequential GraphQL mutations via `gh api graphql`.

## Rationale

Discovered while landing PR #3040. The GitHub ruleset required all review threads to be resolved before merge. The REST API (`/pulls/{number}/comments`) only lists comments — it cannot resolve threads. The GraphQL API is the only way to programmatically resolve review threads.
