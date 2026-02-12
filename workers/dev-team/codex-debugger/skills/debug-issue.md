# debug-issue

Diagnose an issue from error output using codex_debug, apply the fix, and run back-pressure checks.

## Arguments

`$ARGUMENTS` = `--issue <description>` (required) + `--error-output <text>` (required)

Optional:
- `--cwd <path>` - Working directory for Codex execution (defaults to target repo)
- `--files <list>` - Comma-separated list of suspect files to focus on
- `--max-iterations <n>` - Max back-pressure retry iterations (default: 2)

## Process

1. **Parse Inputs**
   - Extract issue description from `--issue`
   - Extract error output from `--error-output`
   - Resolve `--cwd` to absolute path
   - Read suspect files if `--files` provided

2. **Analyze Error Context**
   - Parse error output for: file paths, line numbers, error codes, stack traces
   - Read affected source files from disk
   - Read `package.json` and `tsconfig.json` for project configuration
   - Identify error class: type error, runtime error, lint violation, test failure

3. **Call codex_debug (Diagnosis + Fix)**
   - Invoke MCP tool with:
     - `issue`: Issue description + parsed error context
     - `errorOutput`: Full error output text
     - `cwd`: Resolved working directory
     - `files`: Affected file paths
     - `mode`: "diagnose_and_fix"
   - Wait for Codex to analyze and generate fix in sandbox

4. **Apply Fix**
   - Parse response: `diagnosis`, `rootCause`, `filesModified`, `fix`
   - Review proposed changes against original files
   - Apply file modifications to disk
   - Present diagnosis and changes to human for review

5. **Run Back-Pressure**
   - `npm run typecheck` - TypeScript compilation
   - `npm run lint` - Linting rules
   - `npm test` - Test suite
   - If all pass: proceed to step 7
   - If any fail: proceed to step 6

6. **Iterate on Failures** (max `--max-iterations` times)
   - Parse new error output from failed checks
   - Feed errors back to `codex_debug` with previous diagnosis as context:
     - `issue`: "Fix attempt introduced new errors"
     - `errorOutput`: New error output
     - `previousDiagnosis`: Prior root cause and fix
   - Apply updated fix, re-run back-pressure
   - If max iterations reached: pause for human intervention

7. **Report Results**
   - Show diagnosis summary
   - Show all file changes with diffs
   - Show back-pressure results (pass/fail per check)
   - Show iteration count

## Output

Modified files in target repo:
- Patched source files addressing the diagnosed issue
- Updated tests if the fix required test changes

Response includes:
- `diagnosis`: Root cause explanation
- `rootCause`: Identified root cause category
- `filesModified`: List of changed files
- `iterations`: Number of back-pressure iterations needed
- `backPressure`: Pass/fail per check (typecheck, lint, test)
- `threadId`: Codex thread ID for follow-up

## Human Checkpoints

- Review diagnosis before fix is applied
- Approve file changes when fix touches more than 2 files
- Intervene when back-pressure fails after max iterations
- Confirm fix addresses the original issue (not just symptoms)
