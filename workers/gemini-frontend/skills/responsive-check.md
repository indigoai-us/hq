# responsive-check

Analyze component for responsive design issues across breakpoints. Read-only — no file modifications.

## Arguments

`$ARGUMENTS` = `--file <component-path>` (required)

Optional:
- `--cwd <path>` - Working directory

## Process

1. **Read Component**
   - Read target component file
   - Identify CSS framework in use

2. **Pipe to Gemini for Responsive Analysis**
   ```bash
   KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {file} | GEMINI_API_KEY=$KEY \
     gemini -p "Analyze this component for responsive design issues. Check breakpoints: mobile (320-480px), tablet (768px), desktop (1024px+). Report: layout breaks, overflow, touch targets under 44px, text readability at each breakpoint, missing responsive utilities. Do NOT modify any files." \
     --model pro --sandbox --output-format text 2>&1
   ```

3. **Format Report**
   - Group issues by breakpoint
   - Tag severity per issue
   - Provide fix suggestions

## Output

- Responsive issues grouped by breakpoint (mobile, tablet, desktop)
- Severity per issue
- Fix suggestions with code snippets
- Overall responsive score

## Human Checkpoints

- Review findings
- Route fixes to style-component or gemini-coder if needed
