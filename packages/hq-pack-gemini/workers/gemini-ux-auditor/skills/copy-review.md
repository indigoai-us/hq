# copy-review

Review microcopy quality — error messages, empty states, CTAs, labels, tooltips, confirmation dialogs.

## Arguments

`$ARGUMENTS` = `--scope <path>` or `--cwd <path>` (one required)

Optional:
- `--focus <type>` — Focus: "errors", "empty-states", "ctas", "labels", "all" (default)
- `--tone <voice>` — Target voice: "professional", "friendly", "casual", "technical"

## Process

1. **Extract Copy**
   - Scan components for user-facing strings
   - Find error messages, toast notifications, empty states
   - Find button labels, form labels, headings, tooltips

2. **Review via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && find {scope:-src} -name "*.tsx" | head -40 | xargs cat | GEMINI_API_KEY=$KEY \
     gemini -p "Microcopy review. Focus: {focus}. Target tone: {tone:-professional}.

   Evaluate:
   - ERROR MESSAGES: Are they helpful? Do they explain what happened AND what to do next? Avoid blame language.
   - EMPTY STATES: Do they guide the user to action? Are they encouraging, not discouraging?
   - CTAs: Are they specific and action-oriented? 'Save changes' > 'Submit'. 'Start free trial' > 'Sign up'.
   - LABELS: Are form labels clear and concise? Do they match user mental models?
   - CONFIRMATION DIALOGS: Do they clearly state consequences? Is the destructive action clearly labeled?
   - LOADING STATES: Do they communicate what's happening?
   - CONSISTENCY: Same concept same word throughout? No synonym drift?

   For each finding: quote the current copy, explain the issue, suggest improved copy." \
     --model flash --sandbox --output-format text 2>&1
   ```

## Output

Copy review report with current text, issues, and improved suggestions. Read-only.
