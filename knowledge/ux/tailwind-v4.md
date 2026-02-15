# Tailwind v4 Migration Notes

## Breaking: Named `max-w` Sizes Removed

Tailwind v4 removed the named size scale for `max-w`. These classes **silently do nothing**:

```
max-w-xs, max-w-sm, max-w-md, max-w-lg, max-w-xl, max-w-2xl, ...
max-w-prose, max-w-screen-sm, max-w-screen-md, ...
```

### Fix: Use Arbitrary Values

| Tailwind v3 (broken) | Tailwind v4 (correct) |
|-----------------------|-----------------------|
| `max-w-xs` | `max-w-[20rem]` |
| `max-w-sm` | `max-w-[24rem]` |
| `max-w-md` | `max-w-[28rem]` |
| `max-w-lg` | `max-w-[32rem]` |
| `max-w-xl` | `max-w-[36rem]` |
| `max-w-2xl` | `max-w-[42rem]` |
| `max-w-3xl` | `max-w-[48rem]` |
| `max-w-4xl` | `max-w-[56rem]` |
| `max-w-5xl` | `max-w-[64rem]` |
| `max-w-6xl` | `max-w-[72rem]` |
| `max-w-7xl` | `max-w-[80rem]` |
| `max-w-prose` | `max-w-[65ch]` |

### Why This Is Dangerous

These classes fail **silently** — no build error, no warning. The element just gets no max-width constraint, causing it to collapse to content width or stretch unexpectedly.

### Detection

Search for broken classes in any Tailwind v4 project:
```bash
grep -rn 'max-w-\(xs\|sm\|md\|lg\|xl\|2xl\|3xl\|prose\|screen\)' src/
```

## Other v4 Changes to Watch

- `@apply` still works but is discouraged in favor of utility-first
- Color opacity syntax changed: `bg-red-500/50` (unchanged), but `bg-opacity-50` is removed
- `dark:` variant works differently with CSS-based dark mode
