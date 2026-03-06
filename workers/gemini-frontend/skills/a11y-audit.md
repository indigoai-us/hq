# a11y-audit

WCAG 2.1 AA accessibility audit. Read-only — no file modifications.

## Arguments

`$ARGUMENTS` = `--files <paths>` (required, space-separated or glob)

Optional:
- `--cwd <path>` - Working directory

## Process

1. **Collect Component Files**
   - Resolve file paths/globs
   - Focus on JSX/TSX files with UI elements

2. **Pipe to Gemini for Accessibility Audit**
   ```bash
   KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} | GEMINI_API_KEY=$KEY \
     gemini -p "WCAG 2.1 AA accessibility audit. Check: semantic HTML elements, ARIA roles and labels, keyboard navigation and focus management, color contrast ratios, screen reader compatibility, form labels and error messages, image alt text, heading hierarchy, interactive element sizing. Group by severity: critical, high, medium, low. For each: file, line, WCAG criterion, description, fix with code snippet. Do NOT modify any files." \
     --model pro --sandbox --output-format text 2>&1
   ```

3. **Format Accessibility Report**
   - Group by severity
   - Tag with WCAG success criteria (e.g., 1.1.1, 2.1.1, 4.1.2)
   - Provide fix code snippets

## Output

- Severity-grouped accessibility findings
- WCAG success criteria tags
- Fix code snippets per finding
- Compliance summary

## Human Checkpoints

- Review findings and prioritize fixes
- Route fixes to build-component or gemini-coder
