# Layout & Sizing Patterns

## Modals / Sheets

Standard modal pattern (mobile-first, responsive):

```tsx
{/* Overlay */}
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/60" onClick={onClose} />

  {/* Panel — full width on mobile, constrained on desktop */}
  <div className="relative w-full sm:max-w-[32rem] max-h-[85vh] bg-bg-primary
    border border-border-subtle rounded-t-2xl sm:rounded-2xl
    overflow-hidden flex flex-col">
    ...
  </div>
</div>
```

### Key rules
- Always set `w-full` so the panel fills mobile viewport
- Use `sm:max-w-[Nrem]` (arbitrary value) for desktop constraint — **never** `max-w-lg` etc. (broken in Tailwind v4, see [tailwind-v4.md](tailwind-v4.md))
- Use `max-h-[85vh]` + `overflow-auto` on content area to prevent viewport overflow
- `items-end` on mobile gives bottom-sheet feel; `sm:items-center` centers on desktop

## Centered Content Pages (Setup, Auth, etc.)

```tsx
<div className="min-h-dvh flex items-center justify-center bg-bg-primary p-4">
  <div className="w-full max-w-[28rem] space-y-6">
    {/* Card / form content */}
  </div>
</div>
```

### Key rules
- `min-h-dvh` not `min-h-screen` (accounts for mobile browser chrome)
- Outer padding `p-4` prevents content touching edges on small screens
- Inner `w-full max-w-[28rem]` gives consistent card width

## Width Debugging Checklist

When a component renders too narrow or too wide:

1. Check for named `max-w-*` classes (broken in Tailwind v4)
2. Verify parent is not a flex/grid container shrinking the child
3. Check that `w-full` is set on elements that should fill their container
4. Inspect with browser DevTools — look for `max-width: none` (sign of broken class)
