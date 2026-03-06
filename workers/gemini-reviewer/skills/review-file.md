# review-file

Review specific files for code quality and correctness.

## Arguments

`$ARGUMENTS` = `--files <paths>` (required, space-separated or glob)

Optional:
- `--focus <area>` - Focus area (e.g., "correctness", "performance", "types")
- `--cwd <path>` - Working directory

## Process

1. **Collect Files**
   - Resolve file paths/globs
   - Verify files exist

2. **Pipe to Gemini for Review**
   ```bash
   KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} | GEMINI_API_KEY=$KEY \
     gemini -p "Review this code. Focus: {focus}. Group issues by severity: critical, high, medium, low, info. For each: file, line, category, description, suggested fix." \
     --model flash --sandbox --output-format text 2>&1
   ```

3. **Format Results**
   - Group by severity
   - Highlight patterns (repeated issues across files)

## Output

- Severity-grouped findings per file
- Pattern detection (repeated issues)
- Summary with counts

## Human Checkpoints

- Review findings before routing to gemini-coder for fixes
