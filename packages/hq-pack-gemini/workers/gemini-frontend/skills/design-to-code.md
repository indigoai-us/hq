# design-to-code

Generate a React component from a design description, Paper MCP export, or visual specification.

## Arguments

`$ARGUMENTS` = `--name <ComponentName>` (required, PascalCase)

Optional:
- `--description <text>` — Natural language design description
- `--jsx <path>` — Paper MCP JSX export file (from `get_jsx`)
- `--style <framework>` — CSS framework: "tailwind" (default), "css-modules", "styled"
- `--cwd <path>` — Working directory

## Process

1. **Gather Design Input**
   - If `--jsx` provided: read Paper MCP JSX export
   - If `--description` provided: use as prompt
   - Read design tokens from repo (Tailwind config, CSS vars, `.impeccable.md`)
   - Read existing component patterns for consistency

2. **Generate Component via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {design_context} | GEMINI_API_KEY=$KEY \
     gemini -p "Convert this design into a production React component named {name}.

   Design input: {description or JSX export}

   Requirements:
   - TypeScript with typed props interface and JSDoc
   - {style} for styling, using the project's design tokens
   - Responsive: works at 320px, 768px, 1024px, 1440px
   - Accessible: semantic HTML, ARIA labels, keyboard navigation
   - Animation: entrance animation with prefers-reduced-motion fallback
   - Default export, colocated types
   - Match existing component patterns in this codebase

   If converting from Paper JSX:
   - Replace inline styles with Tailwind classes or design tokens
   - Replace fixed dimensions with responsive/fluid values
   - Add proper React event handlers and state
   - Split into subcomponents if JSX exceeds 50 lines" \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

3. **Run Back-Pressure**
   - `npm run typecheck` — Must pass
   - `npm run lint` — Must pass
   - On failure, re-invoke with error context (max 2 retries)

4. **Present for Approval**
   - Show generated component
   - Note any design decisions made during translation

## Output

Production React component with types, styling, responsiveness, and accessibility. Back-pressure pass/fail status.

## Human Checkpoints

- Approve component spec before generation
- Review generated component for design fidelity
