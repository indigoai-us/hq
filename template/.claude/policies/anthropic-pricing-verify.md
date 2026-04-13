---
id: anthropic-pricing-verify
title: Verify Anthropic API pricing before hardcoding
scope: global
trigger: any code that hardcodes LLM token pricing
enforcement: soft
---

## Rule

Always web-search current Anthropic pricing before hardcoding cost constants. Pricing changes frequently — stale rates can inflate cost estimates by 3x or more. Check platform.claude.com/docs/en/about-claude/pricing.
