# design-tokens

Extract, create, or refine design tokens (CSS custom properties, Tailwind theme) from an existing codebase.

## Arguments

`$ARGUMENTS` = `--cwd <path>` (required)

Optional:
- `--output <format>` — Output format: "tailwind" (default), "css-vars", "both"
- `--scope <path>` — Limit scan to directory

## Process

1. **Scan for Existing Tokens**
   - Read `tailwind.config.*`, `theme.ts`, `tokens.ts`, `globals.css`, CSS variable definitions
   - Scan components for hardcoded values (colors, spacing, fonts, radii, shadows)

2. **Extract via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY $HQ_ROOT/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat tailwind.config.* src/styles/*.{css,ts} 2>/dev/null && find src/components -name "*.tsx" | head -30 | xargs cat | GEMINI_API_KEY=$KEY \
     gemini -p "Extract all design tokens from this codebase. Identify:

   COLORS: All unique colors used. Group by role (background, text, border, accent, semantic).
   TYPOGRAPHY: Font families, size scale, weight scale, line-height scale, letter-spacing values.
   SPACING: All spacing values used. Identify the base unit and scale.
   RADII: Border radius values.
   SHADOWS: Box shadow definitions.
   BREAKPOINTS: Responsive breakpoints.

   Output as {output} format. Flag hardcoded values that should be tokenized. Note inconsistencies (e.g., 3 similar-but-different grays)." \
     --model pro --sandbox --output-format text 2>&1
   ```

3. **Present Token System**
   - Complete token reference table
   - Inconsistency flags
   - Migration suggestions for hardcoded values

## Output

Design token system in requested format with inconsistency flags and migration suggestions. Read-only.
