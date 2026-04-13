# build-component

Create a React/Next.js component with TypeScript types, props, and tests.

## Arguments

`$ARGUMENTS` = `--name <ComponentName>` (required, PascalCase)

Optional:
- `--props <list>` - Comma-separated prop names (e.g., "name,avatar,role,onEdit")
- `--cwd <path>` - Working directory / target repo
- `--style <framework>` - CSS framework ("tailwind", "css-modules", "styled")

## Process

1. **Parse Arguments**
   - Extract component name, props, target directory
   - Detect CSS framework from project config (tailwind.config, etc.)

2. **Analyze Existing Component Patterns**
   - Search repo for existing components
   - Note: file structure, naming, export style, prop patterns, test patterns
   - Read design tokens/theme if available

3. **Pipe Context and Generate via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && GEMINI_API_KEY=$KEY \
     gemini -p "Create a React component named {name} with TypeScript. Props: {props}. Include: typed props interface, JSDoc, default export. Use {style} for styling. Follow existing component patterns in this codebase. Include a test file." \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

4. **Run Back-Pressure**
   - `npm run typecheck` - Must pass
   - `npm run lint` - Must pass
   - On failure, re-invoke with error context (max 2 retries)

5. **Present for Approval**
   - Show generated component + test
   - Show back-pressure results

## Output

- Component file with typed props and JSDoc
- Test file matching repo test conventions
- Back-pressure pass/fail status

## Human Checkpoints

- Approve component spec before generation
- Review generated component for design system alignment
