# style-component

Add or refine styling on an existing component: Tailwind, CSS modules, animations, themes.

## Arguments

`$ARGUMENTS` = `--file <component-path>` (required)

Optional:
- `--style <framework>` - CSS framework ("tailwind", "css-modules", "styled")
- `--goals <description>` - Styling goals (e.g., "dark mode, hover states, animation")
- `--cwd <path>` - Working directory

## Process

1. **Read Component and Design Context**
   - Read target component file
   - Find design tokens (CSS vars, Tailwind config, theme file)
   - Check `knowledge/public/design-styles/` for project style

2. **Pipe to Gemini with Design Context**
   ```bash
   KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {file} {design_tokens} | GEMINI_API_KEY=$KEY \
     gemini -p "Refine the styling of this component. Goals: {goals}. Match the design token system. Use {style} framework. Maintain existing functionality." \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

3. **Run Back-Pressure**
   - `npm run typecheck` - Must pass
   - `npm run lint` - Must pass
   - On failure, re-invoke with error context

4. **Present for Approval**
   - Show styling diff
   - Highlight design token usage

## Output

- Modified component with updated styling
- Back-pressure pass/fail status

## Human Checkpoints

- Review styling approach and design system alignment
- Verify visual appearance if possible
