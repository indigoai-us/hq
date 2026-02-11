# apply-best-practices

Run a standard improvement pass with predefined quality goals. Wraps codex_improve with a fixed set of best-practice goals for consistent code quality.

## Arguments

`$ARGUMENTS` = `--files <glob-or-list>` (required, e.g., "src/**/*.ts" or "src/api/routes/*.ts")

Optional:
- `--cwd <path>` - Working directory / target repo
- `--skip <goals>` - Comma-separated goals to skip (e.g., "performance,readability")
- `--only <goals>` - Comma-separated goals to run exclusively (overrides default set)

## Process

1. **Resolve Files**
   - Expand glob patterns in `--files` to concrete file list
   - Verify each file exists; skip missing files with warning
   - Read files to capture "before" state
   - Cap at 10 files per run (warn if exceeded)

2. **Determine Goals**
   - Default predefined goals (applied in order):
     1. **Error handling** - Add try/catch, typed errors, recovery logic, avoid swallowed exceptions
     2. **Type safety** - Replace `any` with proper types, add generics, narrow union types, use strict null checks
     3. **Performance** - Memoize expensive computations, avoid unnecessary re-renders, optimize loops, reduce allocations
     4. **Readability** - Extract complex logic into named functions, improve variable naming, add JSDoc for public APIs, remove dead code
   - If `--skip` provided: remove listed goals from default set
   - If `--only` provided: use only the listed goals (must be from predefined set)
   - Validate at least one goal remains

3. **Call codex_improve** (per goal)
   - For each goal, invoke MCP tool with:
     - `cwd`: Resolved working directory
     - `files`: Array of resolved file paths (relative to cwd)
     - `goals`: Single goal as array (sequential application ensures no conflicts)
   - Collect improvements from each pass
   - After each goal pass, verify files are still valid (quick syntax check)

4. **Aggregate Results**
   - Combine improvements from all goal passes
   - Deduplicate: if multiple goals modified the same line range, keep the last change
   - Generate unified diff for each modified file (before first pass vs. after last pass)

5. **Run Back-Pressure**
   - `npm run typecheck` - TypeScript compilation
   - `npm run lint` - Linting rules
   - `npm test` - Test suite
   - If any fail: revert ALL changes (atomic — either all goals apply or none), report errors
   - If all pass: confirm best practices applied successfully

6. **Present for Approval**
   - Show per-goal summary with improvement counts
   - Show complete unified diff
   - Show back-pressure results
   - Get human approval before finalizing

## Output

Improved files in target repo (after approval):
- Modified source files with best-practice improvements
- No new files created

Response includes:
- `summary`: Overall improvement summary
- `goalsApplied`: Array of goals with improvement counts
- `improvements`: Array of `{ file, goal, description, before, after }`
- `filesModified`: List of all changed files
- `threadId`: Codex thread ID
- `totalImprovements`: Count of all changes made

## Human Checkpoints

- Review predefined goals before execution (confirm skip/only selections)
- Review per-goal improvements before accepting
- Approve back-pressure results
- Decide whether to keep or revert if back-pressure fails
