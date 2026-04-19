# refactor

Code restructuring without behavior change: extraction, renaming, reorganization.

## Arguments

`$ARGUMENTS` = `--goal <description>` (required, e.g., "extract auth middleware")

Optional:
- `--files <glob>` - Files to refactor (e.g., "src/api/*.ts")
- `--cwd <path>` - Working directory / target repo

## Process

1. **Parse Arguments**
   - Extract refactoring goal, target files, working directory

2. **Analyze Current Structure**
   - Read target files
   - Map dependencies and references
   - Identify test coverage for affected code

3. **Generate Refactoring via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} | GEMINI_API_KEY=$KEY \
     gemini -p "Refactor: {goal}. Do NOT change behavior. Preserve all existing tests. Follow existing patterns." \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

4. **Run Back-Pressure (critical)**
   - `npm run typecheck` - Must pass
   - `npm run lint` - Must pass
   - `npm test` - **Must pass** (behavior must not change)
   - On failure, re-invoke with error context (max 2 retries)

5. **Present for Approval**
   - Show complete diff
   - Show back-pressure results (especially test results)
   - Get human approval

## Output

- Modified source files
- Updated imports/references
- Back-pressure pass/fail (test results critical)

## Human Checkpoints

- Approve refactoring plan before execution
- Review diffs carefully — behavior must not change
- Verify all tests still pass
