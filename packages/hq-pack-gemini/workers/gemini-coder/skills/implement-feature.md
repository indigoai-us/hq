# implement-feature

Multi-step feature implementation: analyze requirements, generate code via Gemini CLI, run back-pressure checks, iterate on failures.

## Arguments

`$ARGUMENTS` = `--story <story-id>` (required, e.g., "US-001")

Optional:
- `--repo <path>` - Target repository path
- `--prd <file>` - PRD JSON file to read story from
- `--max-iterations <n>` - Max back-pressure retry iterations (default: 2)

## Process

1. **Load Story Requirements**
   - Read story from PRD if `--prd` provided, else infer from `--story` ID
   - Extract: title, description, acceptance criteria, notes
   - Identify target files and affected areas

2. **Analyze Codebase**
   - Search target repo for related code (`qmd vsearch` or Grep)
   - Identify patterns: file structure, naming, imports, test conventions
   - Map dependencies and integration points
   - Read existing types/interfaces relevant to feature

3. **Generate Implementation Plan**
   - Break feature into discrete code changes
   - Order changes by dependency (types -> utils -> services -> routes -> tests)
   - Present plan to human for approval

4. **Generate Code via Gemini (Iteration Loop)**
   - For each planned change:
     ```bash
     KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
     cd {repo} && GEMINI_API_KEY=$KEY \
       gemini -p "Implement: {change_description}. Acceptance criteria: {ac_subset}. Follow existing patterns in this codebase." \
       --model pro --approval-mode yolo --output-format text 2>&1
     ```
   - Collect all generated/modified files after each step

5. **Run Back-Pressure**
   - `npm run typecheck` - Must pass
   - `npm run lint` - Must pass
   - `npm test` - Must pass
   - If all pass: proceed to step 7
   - If any fail: proceed to step 6

6. **Iterate on Failures** (max `--max-iterations` times)
   - Capture error output from failed checks
   - Feed errors back to Gemini:
     ```bash
     cd {repo} && GEMINI_API_KEY=$KEY \
       gemini -p "Fix the following errors in the generated code: {error_output}" \
       --model pro --approval-mode yolo --output-format text 2>&1
     ```
   - Re-run back-pressure after each fix attempt
   - If max iterations reached and still failing: pause for human intervention

7. **Validate Acceptance Criteria**
   - Check each acceptance criterion against implementation
   - Report pass/fail per criterion
   - Flag any uncovered criteria

8. **Present for Approval**
   - Show complete diff of all changes
   - Show back-pressure results
   - Show acceptance criteria coverage
   - Get human approval

## Output

Implementation in target repo:
- New source files (services, routes, components)
- Modified existing files
- New/updated test files

Response includes:
- `summary`: Feature implementation summary
- `filesCreated`: All new files
- `filesModified`: All changed files
- `iterations`: Number of back-pressure iterations needed
- `acceptanceCriteria`: Pass/fail per criterion

## Human Checkpoints

- Approve implementation plan before code generation
- Review generated code if back-pressure passes on first try
- Intervene if back-pressure fails after max iterations
- Final approval before merging changes
