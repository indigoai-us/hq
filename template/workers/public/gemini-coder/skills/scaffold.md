# scaffold

Project or module scaffolding with directory structure, boilerplate, and configs.

## Arguments

`$ARGUMENTS` = `--template <type>` (required, e.g., "next-api-route", "react-component", "express-service")

Optional:
- `--name <module-name>` - Name for the scaffolded module
- `--cwd <path>` - Working directory / target repo

## Process

1. **Parse Arguments**
   - Extract template type, module name, target directory
   - Detect project type from package.json

2. **Analyze Project Structure**
   - Scan existing directory structure for conventions
   - Identify config patterns (tsconfig, eslint, test setup)
   - Note naming conventions (camelCase, kebab-case, etc.)

3. **Generate via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && GEMINI_API_KEY=$KEY \
     gemini -p "Scaffold a {template} module named {name}. Create directory structure, boilerplate files, types, config, and test stubs. Follow existing patterns in this codebase." \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

4. **Run Back-Pressure**
   - `npm run typecheck` - Must pass
   - `npm run lint` - Must pass
   - On failure, re-invoke with error context (max 2 retries)

5. **Present for Approval**
   - Show created file tree
   - Show back-pressure results
   - Get human approval

## Output

- New directory with scaffolded files
- Types, config, test stubs
- File tree listing

## Human Checkpoints

- Approve scaffold plan before file creation
- Review created files for correctness
