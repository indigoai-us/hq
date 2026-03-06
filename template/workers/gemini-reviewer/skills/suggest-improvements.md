# suggest-improvements

Generate ranked improvement suggestions without applying changes.

## Arguments

`$ARGUMENTS` = `--files <paths>` (required)

Optional:
- `--goals <areas>` - Improvement goals (e.g., "error handling, types, performance")
- `--cwd <path>` - Working directory

## Process

1. **Collect Files**
   - Resolve file paths
   - Read current code

2. **Pipe to Gemini for Suggestions**
   ```bash
   KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} | GEMINI_API_KEY=$KEY \
     gemini -p "Suggest improvements for this code. Goals: {goals}. Do NOT apply changes. For each suggestion: file, line, goal addressed, description, code snippet showing the improvement. Rank by impact: high, medium, low." \
     --model flash --sandbox --output-format text 2>&1
   ```

3. **Format Suggestions**
   - Rank by impact
   - Group by goal area
   - Include code snippets

## Output

- Ranked improvement suggestions
- Code snippets for each suggestion
- Impact assessment per suggestion
- Grouped by goal area

## Human Checkpoints

- Review suggestions and select which to implement
- Route selected improvements to gemini-coder refactor
