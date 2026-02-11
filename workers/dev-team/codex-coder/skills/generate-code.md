# generate-code

Generate code from a task description using the codex_generate MCP tool.

## Arguments

`$ARGUMENTS` = `--task <description>` (required)

Optional:
- `--cwd <path>` - Working directory for Codex execution (defaults to target repo)
- `--context <files>` - Comma-separated list of context files to include
- `--output-schema <file>` - JSON schema file for structured output

## Process

1. **Parse Task**
   - Extract task description from `--task`
   - Resolve `--cwd` to absolute path
   - Read context files if provided (max 10 files, max 50KB total)

2. **Analyze Target Repo**
   - Read `package.json` for project type and dependencies
   - Read `tsconfig.json` for TypeScript configuration
   - Identify existing patterns (naming conventions, file structure)

3. **Call codex_generate**
   - Invoke MCP tool with:
     - `task`: Full task prompt with repo context
     - `cwd`: Resolved working directory
     - `contextFiles`: Array of context file paths
     - `outputSchema`: Structured output schema (if provided)
   - Wait for Codex to complete generation in sandbox

4. **Collect Results**
   - Parse response: `filesCreated`, `filesModified`, `summary`, `suggestions`
   - Read generated files from disk
   - Present to human for review

5. **Run Back-Pressure**
   - `npm run typecheck` - TypeScript compilation
   - `npm run lint` - Linting rules
   - `npm test` - Test suite
   - If any fail: report errors, suggest fixes

6. **Present for Approval**
   - Show generated/modified files with diffs
   - Show back-pressure results
   - Get human approval before finalizing

## Output

Generated files in target repo:
- New source files as specified by task
- Modified existing files (if task required changes)

Response includes:
- `summary`: What was generated
- `filesCreated`: List of new files
- `filesModified`: List of changed files
- `threadId`: Codex thread ID for resume/iteration
- `suggestions`: Follow-up improvements from Codex

## Human Checkpoints

- Approve task prompt before sending to Codex
- Review generated code before accepting
- Confirm back-pressure results are acceptable
