# write-function

Single function generation with types, JSDoc, and tests.

## Arguments

`$ARGUMENTS` = `--name <function-name>` (required)

Optional:
- `--spec <description>` - Function specification
- `--cwd <path>` - Working directory / target repo
- `--file <path>` - Target file to write function into

## Process

1. **Parse Arguments**
   - Extract function name, spec, target directory
   - Detect project language/framework from `package.json` or file extensions

2. **Analyze Existing Patterns**
   - Search repo for similar functions (naming, exports, error handling)
   - Read types/interfaces relevant to the function
   - Note test conventions (jest, vitest, etc.)

3. **Generate via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && GEMINI_API_KEY=$KEY \
     gemini -p "Write a TypeScript function named {name}. Spec: {spec}. Include: proper types, JSDoc, error handling. Follow existing patterns in this codebase." \
     --model pro --sandbox --output-format text 2>&1
   ```

4. **Run Back-Pressure**
   - `npm run typecheck` - Must pass
   - `npm run lint` - Must pass
   - On failure, re-invoke with error context (max 2 retries)

5. **Present for Approval**
   - Show generated function code
   - Show back-pressure results
   - Get human approval before writing

## Output

- Generated function with types and JSDoc
- Test file if test patterns detected in repo
- Back-pressure pass/fail status

## Human Checkpoints

- Review function before writing to file
- Approve if it matches spec and existing patterns
