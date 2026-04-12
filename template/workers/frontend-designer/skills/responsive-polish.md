# responsive-polish

Fix responsive issues across breakpoints — layout breaks, overflow, touch targets, text readability.

## Arguments

`$ARGUMENTS` = `--scope <path>` or `--file <path>` (one required)

Optional:
- `--breakpoints <list>` — Breakpoints to check: "320,768,1024,1440" (default)
- `--cwd <path>` — Working directory

## Process

1. **Read Components**
   - Read target file(s)
   - Read Tailwind config for breakpoint definitions
   - Check for existing responsive patterns

2. **Analyze via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY ~/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} tailwind.config.* 2>/dev/null | GEMINI_API_KEY=$KEY \
     gemini -p "Responsive analysis and fix. Check each breakpoint ({breakpoints}):

   - LAYOUT BREAKS: Content overflow, flex/grid issues, stacking order
   - TOUCH TARGETS: Buttons/links below 44px on mobile
   - TEXT READABILITY: Font sizes too small at mobile widths
   - IMAGE HANDLING: Missing responsive sizing, aspect ratio issues
   - SPACING: Padding/gap values that don't scale appropriately
   - OVERFLOW: Horizontal scroll, content clipping

   For each issue: describe problem, which breakpoint, and provide the fix.
   Apply fixes using Tailwind responsive prefixes (sm:, md:, lg:, xl:) or clamp()." \
     --model flash --sandbox --output-format text 2>&1
   ```

3. **Apply Fixes (if approved)**
   - Re-run with `--approval-mode yolo` to apply suggested fixes

## Output

Responsive analysis report with fix suggestions. Applies fixes after approval.
