# AI Slop Test

A quality gate for AI-generated interfaces. If you showed this interface to someone and said "AI made this," would they believe you immediately? If yes, that's the problem.

A distinctive interface should make someone ask "how was this made?" not "which AI made this?"

## The Fingerprint Checklist

Review these common fingerprints of AI-generated work from 2024-2025. If your interface exhibits multiple items from this list, it needs redesign.

### Typography
- Using overused fonts: Inter, Roboto, Arial, Open Sans, system defaults
- Using monospace typography as lazy shorthand for "technical/developer" vibes
- Putting large icons with rounded corners above every heading

### Color & Theme
- The AI color palette: cyan-on-dark, purple-to-blue gradients, neon accents on dark backgrounds
- Gradient text for "impact" -- especially on metrics or headings
- Defaulting to dark mode with glowing accents
- Using pure black (#000) or pure white (#fff) without tinting
- Gray text on colored backgrounds

### Layout & Space
- Wrapping everything in cards
- Nesting cards inside cards
- Identical card grids: same-sized cards with icon + heading + text, repeated endlessly
- The hero metric layout template: big number, small label, supporting stats, gradient accent
- Centering everything instead of using left-aligned text with asymmetric layouts
- Using the same spacing everywhere without rhythm

### Visual Details
- Glassmorphism everywhere: blur effects, glass cards, glow borders used decoratively
- Rounded elements with thick colored border on one side
- Sparklines as decoration: tiny charts that look sophisticated but convey nothing
- Rounded rectangles with generic drop shadows
- Overuse of modals

### Motion
- Bounce or elastic easing curves
- Animating layout properties (width, height, padding, margin) instead of transform and opacity

### Interaction
- Repeating the same information: redundant headers, intros that restate the heading
- Making every button primary instead of using hierarchy (ghost buttons, text links, secondary styles)

---

**The test is simple**: would a skilled human designer make these same choices? If the answer is "only if they were being lazy," your interface has slop.
