# dark-mode

Add or fix dark mode support — CSS custom properties, Tailwind dark: variants, color-scheme meta.

## Arguments

`$ARGUMENTS` = `--scope <path>` or `--file <path>` (one required)

Optional:
- `--strategy <approach>` — "tailwind-dark" (default), "css-vars", "class-toggle"
- `--cwd <path>` — Working directory

## Process

1. **Audit Current Dark Mode State**
   - Check for existing dark mode implementation (Tailwind dark:, CSS vars, class-based)
   - Read global styles for color-scheme support
   - Identify components missing dark mode

2. **Generate Dark Mode via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY ~/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} tailwind.config.* src/styles/globals.css 2>/dev/null | GEMINI_API_KEY=$KEY \
     gemini -p "Add dark mode support using {strategy}.

   Rules:
   - OKLCH color space for dark palette (not just inverted HSL)
   - Dark backgrounds: neutral 10-20% lightness, slightly warm or cool (not pure black)
   - Dark text: 85-95% lightness (not pure white)
   - Maintain WCAG AA contrast in dark mode
   - Reduce shadow intensity and border visibility for dark mode
   - Ensure images/illustrations work in dark context
   - Add color-scheme: dark meta tag support
   - Use semantic tokens (--color-surface, --color-text) not hardcoded values

   Modify components in-place. Preserve all existing light mode styling." \
     --model flash --approval-mode yolo --output-format text 2>&1
   ```

3. **Run Back-Pressure**
   - `npm run typecheck` — Must pass
   - `npm run lint` — Must pass

## Output

Components updated with dark mode support. Back-pressure pass/fail status.
