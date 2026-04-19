---
id: guest-auth-wasGuestRef
title: {company} guest→auth migration requires wasGuestRef
scope: repo
trigger: modifying auth flow in {company}-app
enforcement: soft
---

## Rule

In {company}'s `AuthContext.tsx`, `wasGuestRef.current` must be set to `true` in ANY code path that enters guest mode. Without it, `onAuthStateChange` won't trigger guest data migration when the user signs up, and `fetchOnboardingStatus()` will query an empty profiles table — causing an infinite onboarding loop.

Code paths that must set `wasGuestRef.current = true`:
1. `enterGuestMode()` — user taps "Get Started"
2. Session init detecting existing guest mode from AsyncStorage

