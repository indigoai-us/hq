# ux-audit

Heuristic evaluation using Nielsen's 10 usability heuristics, cognitive load assessment, and interaction cost analysis.

## Arguments

`$ARGUMENTS` = `--cwd <path>` (required)

Optional:
- `--scope <path>` — Limit to specific section (e.g., "src/app/dashboard")
- `--focus <area>` — Focus: "navigation", "forms", "feedback", "all" (default)

## Process

1. **Load Application Structure**
   - Read app router / pages structure
   - Read layout components
   - Read key page components and shared UI

2. **Evaluate via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY ${HQ_ROOT:-$HOME/hq}/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && find src/app src/components src/pages -name "*.tsx" 2>/dev/null | head -50 | xargs cat | GEMINI_API_KEY=$KEY \
     gemini -p "UX heuristic evaluation. Apply Nielsen's 10 usability heuristics:

   1. Visibility of system status
   2. Match between system and real world
   3. User control and freedom
   4. Consistency and standards
   5. Error prevention
   6. Recognition over recall
   7. Flexibility and efficiency of use
   8. Aesthetic and minimalist design
   9. Help users recognize, diagnose, recover from errors
   10. Help and documentation

   Also evaluate:
   - COGNITIVE LOAD: Information density, decision points, visual complexity
   - INTERACTION COST: Clicks/taps to complete key tasks, unnecessary steps
   - AFFORDANCE: Are interactive elements clearly clickable/tappable?
   - FEEDBACK: Are loading states, success states, error states all handled?

   Focus: {focus}
   Rate each heuristic 1-5. Group findings by severity. Reference specific components." \
     --model flash --sandbox --output-format text 2>&1
   ```

## Output

Structured heuristic evaluation with ratings, severity-grouped findings, and component references. Read-only.
