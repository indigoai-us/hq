# css-refactor

Refactor CSS for modern patterns — reduce duplication, improve specificity, migrate to container queries, :has(), oklch.

## Arguments

`$ARGUMENTS` = `--file <path>` or `--scope <path>` (one required)

Optional:
- `--goals <description>` — Specific refactor goals (e.g., "migrate to oklch", "reduce duplication")
- `--cwd <path>` — Working directory

## Process

1. **Analyze Current CSS**
   - Read target CSS/component files
   - Identify patterns: duplication, deep nesting, !important usage, vendor prefixes
   - Check for outdated patterns

2. **Refactor via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY $HQ_ROOT/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} | GEMINI_API_KEY=$KEY \
     gemini -p "CSS refactor. Goals: {goals:-reduce duplication, modernize patterns}.

   Improvements to apply:
   - Replace duplicated values with CSS custom properties
   - Migrate hex/rgb/hsl colors to oklch()
   - Replace fixed px sizes with clamp() where appropriate
   - Use modern selectors (:has(), :is(), :where()) to reduce specificity issues
   - Replace media queries with container queries where component-scoped
   - Remove !important usage (fix specificity instead)
   - Consolidate similar utility patterns
   - Add logical properties (inline/block) where beneficial

   Preserve all existing visual behavior. Do not change appearance, only improve code quality." \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

3. **Run Back-Pressure**
   - `npm run typecheck` — Must pass
   - `npm run lint` — Must pass

## Output

Refactored CSS with modern patterns. Back-pressure pass/fail status.

## Human Checkpoints

- Review refactor scope before execution
- Verify visual behavior is preserved after refactor
