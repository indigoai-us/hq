# scaffold-component

Detect component type, scaffold files via Codex, and generate test stubs.

## Arguments

`$ARGUMENTS` = `--name <ComponentName>` (required)

Optional:
- `--type <type>` - Component type: `react` | `api-route` | `service` | `hook` | `middleware` (auto-detected if omitted)
- `--cwd <path>` - Working directory / target repo
- `--props <list>` - Comma-separated prop names for React components
- `--methods <list>` - Comma-separated method names for services

## Process

1. **Detect Component Type**
   - If `--type` provided, use it directly
   - Otherwise, infer from component name and repo structure:
     - Names ending in `Page`, `View`, `Card`, `Modal`, `Form` -> `react`
     - Names ending in `Service`, `Manager`, `Handler` -> `service`
     - Names starting with `use` -> `hook`
     - Names ending in `Middleware`, `Guard` -> `middleware`
     - Names matching route patterns -> `api-route`
   - Read `package.json` to confirm framework (Next.js, Express, etc.)

2. **Determine File Locations**
   - Scan existing repo structure for placement conventions:
     - React: `src/components/`, `src/app/`, `app/`
     - Services: `src/services/`, `src/lib/`
     - Hooks: `src/hooks/`
     - Middleware: `src/middleware/`
     - API routes: `src/app/api/`, `src/routes/`
   - Match naming convention (kebab-case files, PascalCase exports, etc.)

3. **Generate Scaffold via codex_generate**
   - Call `codex_generate` with:
     - Task: "Scaffold a {type} named {name}" + props/methods + conventions found
     - Context files: nearest existing component of same type, shared types, utils
     - CWD: target repo
   - Codex generates:
     - Main component/module file
     - Type definitions (if separate)
     - Index/barrel export update

4. **Generate Tests**
   - Call `codex_generate` with:
     - Task: "Write tests for {name} {type}" + generated source as context
     - Context: test patterns from existing tests in repo
   - Codex generates:
     - Unit test file (`.test.ts` / `.test.tsx`)
     - Test fixtures/mocks if needed

5. **Run Back-Pressure**
   - `npm run typecheck` - TypeScript compilation
   - `npm run lint` - Linting rules
   - `npm test` - Test suite (new tests should pass)
   - If failures: iterate once with error context via codex_generate

6. **Present for Approval**
   - Show all scaffolded files
   - Show test results
   - Get human approval

## Output

Scaffolded files in target repo:
- `src/{location}/{name}.tsx` (or `.ts`) - Main component/module
- `src/{location}/{name}.test.tsx` (or `.test.ts`) - Test file
- Updated barrel exports (if applicable)

Response includes:
- `summary`: What was scaffolded
- `filesCreated`: All new files
- `componentType`: Detected or specified type
- `testsPassing`: Boolean
- `threadId`: Codex thread ID

## Human Checkpoints

- Confirm component type detection is correct
- Review scaffolded code before accepting
- Approve test coverage scope
