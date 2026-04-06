# design-audit

Comprehensive visual audit of a codebase's UI — spacing, typography, color, alignment, design token adherence.

## Arguments

`$ARGUMENTS` = `--cwd <path>` (required — target repo)

Optional:
- `--scope <path>` — Limit to specific directory (e.g., "src/components/dashboard")
- `--severity <level>` — Minimum severity to report ("critical", "warning", "info")

## Process

1. **Gather Context**
   - Read `.impeccable.md` if exists (project design system)
   - Read `tailwind.config.*` and design token files
   - Read all component files in scope (up to 50 files)
   - Read `knowledge/public/impeccable/` standards

2. **Pipe to Gemini for Audit**
   ```bash
   KEY=$(grep GEMINI_API_KEY $HQ_ROOT/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && find {scope:-src/components} -name "*.tsx" -o -name "*.css" | head -50 | xargs cat | GEMINI_API_KEY=$KEY \
     gemini -p "Comprehensive design audit. Evaluate these dimensions:

   SPACING: Consistency of gaps, padding, margins. Is there a clear spacing scale? Uneven gaps or cramped groups?
   TYPOGRAPHY: Hierarchy strength (heading vs body vs caption). Font sizes, weights, line-heights. Readability at small sizes.
   COLOR: Palette coherence. OKLCH usage. Contrast ratios (WCAG AA). Any pure black/gray body text?
   ALIGNMENT: Vertical and horizontal alignment consistency. Shared visual lanes across repeated elements.
   TOKENS: Are design tokens used consistently? Hardcoded values that should be tokens?
   REPETITION: Grid-like sameness vs intentional variation.

   Group findings by severity: CRITICAL (accessibility/usability impact), WARNING (inconsistency/drift), INFO (improvement opportunity).
   Reference specific files and patterns. Suggest concrete fixes." \
     --model pro --sandbox --output-format text 2>&1
   ```

3. **Format Report**
   - Structured report with severity groups
   - File references for each finding
   - Concrete fix suggestions

## Output

Structured audit report grouped by severity with file references and fix suggestions. Read-only — no file modifications.
