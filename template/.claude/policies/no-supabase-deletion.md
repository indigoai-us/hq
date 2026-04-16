---
id: hq-no-supabase-deletion
title: Never Delete Supabase Projects Without Confirmation
scope: global
trigger: before deleting any Supabase or Vercel project
enforcement: hard
version: 1
created: 2026-02-22
updated: 2026-02-22
source: migration
---

## Rule

NEVER delete Supabase projects without confirming with user first. {project-name} was {Product}'s DB and was incorrectly deleted as "unused". Always ask before deleting any Supabase/Vercel project.

