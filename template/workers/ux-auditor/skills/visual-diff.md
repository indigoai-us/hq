# visual-diff

Compare two components or pages for visual inconsistency — structural patterns, styling approach, design language alignment.

## Arguments

`$ARGUMENTS` = `--files <file1,file2>` (required — comma-separated component paths)

Optional:
- `--cwd <path>` — Working directory
- `--focus <aspect>` — Focus area: "spacing", "typography", "color", "all" (default)

## Process

1. **Read Both Components**
   - Read both component files
   - Read shared design tokens/theme

2. **Compare via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY ~/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {file1} {file2} {design_tokens} | GEMINI_API_KEY=$KEY \
     gemini -p "Visual diff analysis. Compare these two components for inconsistencies:

   STRUCTURAL: Layout approach, nesting depth, component composition
   SPACING: Padding, gaps, margins — do they follow the same rhythm?
   TYPOGRAPHY: Font choices, sizes, weights, line-heights — aligned?
   COLOR: Palette usage, contrast, semantic color mapping
   INTERACTION: Hover/focus/active states — consistent patterns?
   RESPONSIVENESS: Breakpoint behavior — aligned approach?

   Focus: {focus}
   For each difference: classify as INTENTIONAL (different purpose) or DRIFT (should be aligned). Suggest unification where appropriate." \
     --model pro --sandbox --output-format text 2>&1
   ```

## Output

Diff report classifying differences as intentional vs drift, with unification suggestions. Read-only.
