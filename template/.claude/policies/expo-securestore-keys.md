---
id: expo-securestore-keys
title: expo-secure-store key names must not contain colons
scope: global
trigger: SecureStore, expo-secure-store, key naming
enforcement: hard
version: 1
created: 2026-03-18
---

## Rule

`expo-secure-store` only allows keys matching `/^[\w.-]+$/` — letters, digits, underscores, dots, hyphens. **Colons are NOT allowed.** Use dots as namespace separators (e.g. `{company}.auth` not `{company}:auth`).

The error message "Invalid key" appears as an unhandled promise rejection that's easy to miss — it shows briefly in the dev error banner then disappears.

## Rationale

Caused a production bug where tapping a rep name in the Amass field app did nothing. `SecureStore.setItemAsync('{company}:auth', '1')` threw silently, preventing navigation. Fixed by changing all keys from colons to dots.

## How to apply

When creating SecureStore keys in any Expo app, always use dots or underscores as separators, never colons.
