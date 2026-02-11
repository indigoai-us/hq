# fix-bug

Full debugging workflow: diagnose via codex_debug, implement fix via codex_generate, and run the complete back-pressure loop.

## Arguments

`$ARGUMENTS` = `--issue <description>` (required)

Optional:
- `--cwd <path>` - Working directory for Codex execution (defaults to target repo)
- `--error-output <text>` - Error output or reproduction steps
- `--files <list>` - Comma-separated list of suspect files to focus on
- `--max-iterations <n>` - Max back-pressure retry iterations (default: 2)
- `--skip-diagnosis` - Skip codex_debug and go straight to fix (use when root cause is already known)

## Process

1. **Parse Inputs**
   - Extract issue description from `--issue`
   - Extract error output from `--error-output` if provided
   - Resolve `--cwd` to absolute path
   - Read suspect files if `--files` provided

2. **Gather Codebase Context**
   - Search target repo for code related to the issue (`qmd vsearch` or Grep)
   - Read affected source files, types, and interfaces
   - Read `package.json` for dependencies and scripts
   - Read `tsconfig.json` for TypeScript configuration
   - Identify test files covering the affected code

3. **Diagnose via codex_debug** (skip if `--skip-diagnosis`)
   - Invoke MCP tool with:
     - `issue`: Issue description + gathered context
     - `errorOutput`: Error output (if available)
     - `cwd`: Resolved working directory
     - `files`: Affected file paths
     - `mode`: "analysis_only"
   - Parse diagnosis: `rootCause`, `affectedFiles`, `suggestedFixes`
   - Present diagnosis to human for approval before proceeding

4. **Generate Fix via codex_generate**
   - Using the diagnosis (or `--issue` if `--skip-diagnosis`), call `codex_generate` with:
     - `task`: "Fix the following bug: {rootCause}. Apply the suggested fix: {selectedFix}"
     - `contextFiles`: Affected source files + related types + existing tests
     - `cwd`: Resolved working directory
   - Wait for Codex to generate fix in sandbox
   - Parse response: `filesCreated`, `filesModified`, `summary`

5. **Apply Fix**
   - Review proposed changes against original files
   - Apply file modifications to disk
   - If new test cases were generated, include them
   - Present changes to human for review

6. **Run Back-Pressure**
   - `npm run typecheck` - TypeScript compilation
   - `npm run lint` - Linting rules
   - `npm test` - Test suite (including new tests)
   - If all pass: proceed to step 8
   - If any fail: proceed to step 7

7. **Iterate on Failures** (max `--max-iterations` times)
   - Parse error output from failed checks
   - Feed errors back to `codex_generate` as context:
     - `task`: "The previous fix introduced errors. Fix them while preserving the bug fix"
     - `contextFiles`: Error output + affected files + original diagnosis
   - Apply updated fix, re-run back-pressure
   - If max iterations reached: pause for human intervention

8. **Validate Fix**
   - Confirm original issue is resolved (re-run original failing scenario if reproducible)
   - Check no regressions introduced
   - Show complete diff of all changes
   - Show back-pressure results
   - Get human approval

## Output

Modified files in target repo:
- Patched source files fixing the bug
- New or updated test files covering the fix
- Updated types/interfaces if needed

Response includes:
- `diagnosis`: Root cause explanation (from codex_debug)
- `fix`: Summary of changes applied (from codex_generate)
- `filesCreated`: New files (e.g., new tests)
- `filesModified`: Changed files
- `iterations`: Number of back-pressure iterations needed
- `backPressure`: Pass/fail per check (typecheck, lint, test)
- `threadId`: Codex thread ID for follow-up

## Human Checkpoints

- Approve diagnosis before fix generation begins
- Review proposed fix before it is applied to disk
- Intervene when back-pressure fails after max iterations
- Final approval that the bug is resolved and no regressions exist
