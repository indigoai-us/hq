---
id: articles-blog-first
title: Articles must go to blog before social sharing
scope: cross-cutting
trigger: /contentidea, /post, daily-social, article, type:article, blog-queue
enforcement: hard
---

## Rule

Any content with `type: article` in draft frontmatter or assessed as "Article" scope in `/contentidea` must follow the blog-first pipeline:

1. Write as MDX to `repos/private/personal-website/src/content/blog/{slug}.mdx`
2. Add to `workspace/social-drafts/blog-queue.json` with `status: queued`
3. Deploy personal-website to Vercel so blog URL + OG image are live
4. Write a teaser/share draft (3-5 short paragraphs + blog URL) for X and/or LinkedIn
5. Submit the teaser to Post Bridge — NOT the full article text

The X deliverable for articles is a short teaser linking to the blog. Never post full 1500+ word article text directly to X or LinkedIn.

The `/contentidea` "Article" form routes to this pipeline. The daily-social skill checks `blog-queue.json` for pending articles each run.

## Rationale

Blog posts compound (SEO, OG cards, permanent library). X posts disappear in hours. The "Docs-First Agents" blog share (Mar 11) outperformed raw long-form X posts. Every blog article is a deposit into the long-term credibility bank. Established 2026-03-12.
