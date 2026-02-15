# Component Patterns

## Card

The `Card` component (`src/components/Card.tsx`) provides a consistent card surface.

- Clickable variant automatically gets `w-full` and hover state
- Non-clickable variant does NOT get `w-full` — add it via `className` if needed
- Always pass layout classes (padding, spacing) via `className` prop

```tsx
{/* Clickable card */}
<Card onClick={handleClick} className="p-4">
  <p>Content here</p>
</Card>

{/* Static card */}
<Card className="p-4 w-full">
  <p>Content here</p>
</Card>
```

## ActionButton

Standard button for primary actions. Supports `variant="primary" | "prominent"`.

- Always add `className="w-full"` for full-width buttons in forms/modals
- Use `disabled` prop during async operations

## Form Inputs

Standard input pattern:

```tsx
<input
  className="w-full px-3 py-2.5 bg-bg-elevated border border-border-subtle
    rounded-md text-sm text-text-primary placeholder:text-text-tertiary
    focus:outline-none focus:border-accent-blue"
/>
```

- Always `w-full` inside card containers
- Use `bg-bg-elevated` (not `bg-bg-card`) for inputs inside cards to create depth
