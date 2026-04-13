# add-animation

Add purposeful animations to a component — entrance, hover, scroll-triggered, or micro-interactions. Supports Framer Motion, CSS keyframes, and GSAP.

## Arguments

`$ARGUMENTS` = `--file <component-path>` (required)

Optional:
- `--type <animation>` — Animation type: "entrance", "hover", "scroll", "micro", "exit"
- `--framework <lib>` — Animation library: "framer-motion" (default), "css", "gsap"
- `--cwd <path>` — Working directory

## Process

1. **Read Component and Detect Framework**
   - Read target component
   - Check package.json for framer-motion, gsap
   - Read existing animation patterns in the codebase

2. **Generate Animation via Gemini**
   ```bash
   KEY=$(grep GEMINI_API_KEY ~/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {file} package.json | GEMINI_API_KEY=$KEY \
     gemini -p "Add a {type} animation to this component using {framework}.

   Rules:
   - Only animate opacity and transform (compositor-friendly)
   - Must include prefers-reduced-motion: reduce (disable or simplify animation)
   - Duration: 150-300ms for micro, 300-600ms for entrance/exit, 200-400ms for hover
   - Easing: ease-out for entrances, ease-in for exits, ease-in-out for hover
   - No layout-triggering properties (width, height, top, left, margin)
   - Animation should feel purposeful, not decorative
   - Match the existing animation style in the codebase if present

   Modify the component in-place. Preserve all existing functionality." \
     --model pro --approval-mode yolo --output-format text 2>&1
   ```

3. **Run Back-Pressure**
   - `npm run typecheck` — Must pass
   - `npm run lint` — Must pass
   - On failure, re-invoke with error context (max 2 retries)

## Output

Modified component with animation added. Back-pressure pass/fail status.

## Human Checkpoints

- Approve animation approach before generation
- Review animation for purposefulness and reduced-motion support
