# flow-review

Analyze a user flow for friction points, drop-off risk, and completion barriers.

## Arguments

`$ARGUMENTS` = `--flow <name>` (required — e.g., "signup", "checkout", "onboarding", "settings")

Optional:
- `--cwd <path>` — Working directory
- `--persona <type>` — User persona: "new-user", "power-user", "mobile-user"

## Process

1. **Map the Flow**
   - Identify all pages/components involved in the flow
   - Read route definitions (app router, page files)
   - Read form components, validation logic, API calls

2. **Analyze via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && find src -name "*.tsx" | xargs grep -l "{flow}" | head -20 | xargs cat | GEMINI_API_KEY=$KEY \
     gemini -p "User flow analysis for the {flow} flow. Persona: {persona:-general user}.

   Map each step and evaluate:
   - FRICTION POINTS: Where might users hesitate, get confused, or abandon?
   - COGNITIVE LOAD: Steps with too many decisions or too much information
   - ERROR HANDLING: What happens when things go wrong at each step?
   - PROGRESS INDICATION: Can users see where they are in the flow?
   - ESCAPE HATCHES: Can users go back, save progress, or exit gracefully?
   - MOBILE EXPERIENCE: Does the flow work on touch devices?
   - ACCESSIBILITY: Can the flow be completed with keyboard only?
   - DROP-OFF RISK: Rate each step 1-5 for abandonment risk

   Provide a step-by-step flow map with annotations. Suggest specific improvements for each friction point." \
     --model flash --sandbox --output-format text 2>&1
   ```

## Output

Annotated flow map with friction points, drop-off risk ratings, and improvement suggestions. Read-only.
