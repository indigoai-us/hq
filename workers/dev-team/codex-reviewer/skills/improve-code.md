# improve-code

Apply targeted improvements to code files using the codex_improve MCP tool. Shows before/after diffs for human approval.

## Arguments

`$ARGUMENTS` = `--files <glob-or-list>` (required, e.g., "src/services/billing.ts" or "src/api/*.ts")

Required:
- `--goals <list>` - Comma-separated improvement goals (e.g., "error handling, type safety, readability")

Optional:
- `--cwd <path>` - Working directory / target repo

## Process

1. **Resolve Files**
   - Expand glob patterns in `--files` to concrete file list
   - Verify each file exists; skip missing files with warning
   - Read files to capture "before" state for diffing
   - Cap at 10 files per improvement run (warn if exceeded)

2. **Parse Goals**
   - Split `--goals` into individual improvement objectives
   - Validate goals are actionable (not vague like "make better")
   - Examples of valid goals:
     - "error handling" - Add try/catch, error types, recovery logic
     - "type safety" - Replace `any`, add generics, narrow unions
     - "performance" - Memoize, reduce re-renders, optimize queries
     - "readability" - Extract functions, improve naming, add JSDoc
     - "test coverage" - Add missing test cases, edge cases
     - "security" - Input validation, sanitization, auth checks

3. **Call codex_improve**
   - Invoke MCP tool with:
     - `cwd`: Resolved working directory
     - `files`: Array of resolved file paths (relative to cwd)
     - `goals`: Array of improvement goals
   - Wait for Codex to complete improvements in sandbox

4. **Collect and Diff Results**
   - Receive structured response: `improvements[]`, `summary`, `filesModified`, `threadId`
   - For each improvement:
     - `file`: Path to modified file
     - `description`: What was changed and why
     - `before`: Original code snippet
     - `after`: Improved code snippet
   - Generate unified diff for each modified file

5. **Present Before/After**
   - Show each improvement with context and diffs
   - Include Codex `summary` as closing paragraph

6. **Run Back-Pressure** (after human approval)
   - `npm run typecheck` - TypeScript compilation
   - `npm run lint` - Linting rules
   - `npm test` - Test suite
   - If any fail: revert changes, report errors, do NOT iterate automatically
   - If all pass: confirm improvements applied successfully

## Output

Improved files in target repo (after approval):
- Modified source files with targeted improvements
- No new files created (improve-code only modifies existing files)

Response includes:
- `summary`: What was improved across all files
- `improvements`: Array of `{ file, description, before, after }`
- `filesModified`: List of changed files
- `threadId`: Codex thread ID for follow-up
- `goalsAddressed`: Which goals were successfully applied

## Human Checkpoints

- Review before/after diffs before accepting changes
- Approve back-pressure results after improvements applied
- Decide whether to keep or revert if back-pressure fails
