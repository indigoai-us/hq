# review-pr

Review a PR diff via Gemini CLI. Severity-grouped findings.

## Arguments

`$ARGUMENTS` = `--pr <number>` (required) OR `--branch <name>` (diff against main)

Optional:
- `--repo <path>` - Target repository path
- `--focus <area>` - Focus area (e.g., "security", "performance", "correctness")

## Process

1. **Get PR Diff**
   - If `--pr`: `cd {repo} && gh pr diff {pr}`
   - If `--branch`: `cd {repo} && git diff main...{branch}`
   - If neither: `cd {repo} && git diff main...HEAD`

2. **Pipe to Gemini for Review**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {repo} && gh pr diff {pr} | GEMINI_API_KEY=$KEY \
     gemini -p "Review this PR diff. Group issues by severity: critical, high, medium, low, info. For each issue provide: file, line number, category (bug, security, performance, style, logic), description, and suggested fix. Focus: {focus}." \
     --model flash --sandbox --output-format text 2>&1
   ```

3. **Parse and Format Results**
   - Group findings by severity
   - Count issues per category
   - Highlight critical/high items

4. **Present Report**
   - Severity-grouped findings
   - Summary statistics
   - Recommended actions

## Output

Structured review report:
- `critical`: Blocking issues (bugs, security vulnerabilities)
- `high`: Important issues (logic errors, missing edge cases)
- `medium`: Quality issues (naming, structure, duplication)
- `low`: Style/convention issues
- `info`: Observations and suggestions
- `summary`: Issue counts by severity and category

## Human Checkpoints

- Review findings before acting on them
- Decide which issues to address vs accept
