# UX Knowledge Base

Reference for building web interfaces. Consult before any UI/UX work.

## Index

| Topic | File | Summary |
|-------|------|---------|
| Tailwind v4 Migration | [tailwind-v4.md](tailwind-v4.md) | Breaking changes from v3, class replacements |
| Layout & Sizing | [layout.md](layout.md) | Width, containers, modals, responsive patterns |
| Components | [components.md](components.md) | Card, button, input patterns and gotchas |

## Quick Rules

1. **Always use arbitrary values for `max-w`** in Tailwind v4 (e.g., `max-w-[32rem]` not `max-w-lg`)
2. **Read this knowledge base** before building or fixing any UI component
3. **Test on both mobile and desktop** viewports — width issues are the #1 recurring bug
