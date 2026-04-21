# refactor-component

Restructure a React component — extract subcomponents, simplify props, improve composition patterns.

## Arguments

`$ARGUMENTS` = `--file <component-path>` (required)

Optional:
- `--goals <description>` — Specific refactor goals (e.g., "extract card header", "simplify props API")
- `--cwd <path>` — Working directory

## Process

1. **Analyze Component Structure**
   - Read target component and its imports
   - Identify: prop count, JSX depth, render complexity, reuse opportunities
   - Check for existing subcomponents and composition patterns in the codebase

2. **Refactor via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {file} | GEMINI_API_KEY=$KEY \
     gemini -p "Refactor this React component. Goals: {goals:-improve composition, reduce complexity}.

   Apply these patterns:
   - Extract subcomponents when JSX blocks are reusable or exceed 30 lines
   - Simplify props: replace boolean flag groups with enums/variants
   - Use composition (children, render props, slots) over config props
   - Extract custom hooks for stateful logic
   - Colocate types with their component
   - Preserve all existing behavior — this is a refactor, not a redesign

   Output the refactored component(s) with TypeScript types. If extracting subcomponents, create separate files following the existing naming convention." \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

3. **Run Back-Pressure**
   - `npm run typecheck` — Must pass
   - `npm run lint` — Must pass
   - On failure, re-invoke with error context (max 2 retries)

4. **Present for Approval**
   - Show before/after structure
   - Highlight extracted components and simplified APIs

## Output

Refactored component(s) with preserved behavior. Back-pressure pass/fail status.

## Human Checkpoints

- Approve refactor scope before execution
- Review extracted components for naming and API design
