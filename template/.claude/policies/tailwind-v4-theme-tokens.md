---
id: tailwind-v4-theme-tokens
title: Use Tailwind v4 theme tokens over arbitrary color values
scope: global
trigger: editing Tailwind v4 projects with custom themes
enforcement: soft
created_at: 2026-03-30
---

## Rule

In Tailwind v4 projects using `@theme inline` blocks, prefer theme token utilities (`bg-{company}-plum`, `text-{company}-orange`) over arbitrary values (`bg-[#4d0d2e]`, `text-[#ef4323]`). Arbitrary color values can lose specificity against `@layer base` styles in v4's new cascade model, causing the computed style to differ from the class name.

