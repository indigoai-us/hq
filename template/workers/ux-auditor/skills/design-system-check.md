# design-system-check

Verify component consistency against a design system. Flag drift, deviations, and non-conformance.

## Arguments

`$ARGUMENTS` = `--cwd <path>` (required)

Optional:
- `--system <path>` — Path to design system file (default: `.impeccable.md` or `tailwind.config.*`)
- `--scope <path>` — Limit to directory

## Process

1. **Load Design System Reference**
   - Read `.impeccable.md` or specified system file
   - Read `tailwind.config.*` and token definitions
   - Load `knowledge/public/impeccable/` standards as baseline

2. **Load Components**
   - Read all component files in scope
   - Extract styling patterns (classes, inline styles, CSS modules)

3. **Check Consistency via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY ~/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat .impeccable.md tailwind.config.* 2>/dev/null && find {scope:-src/components} -name "*.tsx" | head -40 | xargs cat | GEMINI_API_KEY=$KEY \
     gemini -p "Design system consistency check. Compare every component against the design system.

   Check for:
   - SPACING DRIFT: Components using values outside the spacing scale
   - COLOR DRIFT: Colors not in the defined palette or token set
   - TYPOGRAPHY DRIFT: Font sizes/weights/families not in the type scale
   - PATTERN DRIFT: Components that solve the same problem differently (e.g., two different card patterns)
   - TOKEN BYPASS: Hardcoded values where tokens exist
   - NAMING DRIFT: Inconsistent component naming or class conventions

   For each finding: component file, specific deviation, what the system expects, suggested fix." \
     --model pro --sandbox --output-format text 2>&1
   ```

## Output

Consistency report with drift findings, expected values, and fix suggestions. Read-only.
