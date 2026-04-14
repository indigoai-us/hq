---
id: hq-bugfix-requires-tests
title: Every bugfix must include test coverage
scope: global
trigger: bug fix, broken behavior, regression, hotfix
enforcement: hard
version: 1
created: 2026-04-05
updated: 2026-04-05
source: user-correction
---

## Rule

When fixing a bug or broken behavior, always add tests or E2E coverage that would catch the regression if it recurred. If unsure about test type or scope (unit vs integration vs E2E, which assertions), ask the user before proceeding.

A bugfix without a regression test is incomplete.

