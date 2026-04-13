# competitive-scan

Compare UX patterns against industry standards and competitive landscape.

## Arguments

`$ARGUMENTS` = `--product <description>` (required — what the product does)

Optional:
- `--cwd <path>` — Working directory (to load current implementation)
- `--competitors <list>` — Known competitors to compare against

## Process

1. **Load Current Implementation**
   - Read key UI components and pages
   - Understand current UX patterns

2. **Analyze via Gemini (with Google Search grounding)**
   ```bash
   KEY=$(grep GEMINI_API_KEY ${HQ_ROOT:-$HOME/hq}/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && find src/app src/components -name "*.tsx" 2>/dev/null | head -30 | xargs cat | GEMINI_API_KEY=$KEY \
     gemini -p "Competitive UX analysis for: {product}.

   Given the current implementation, compare against industry best practices:
   - PATTERNS: What UX patterns do leading products in this space use?
   - GAPS: What standard features/patterns is this product missing?
   - DIFFERENTIATORS: What does this product do differently (positively)?
   - TABLE STAKES: What must every product in this space have?
   - INNOVATION: What emerging UX patterns could give a competitive edge?
   - MOBILE: How does mobile UX compare to industry standard?

   Known competitors: {competitors:-infer from product description}
   Be specific — reference real products and real patterns. Don't be generic." \
     --model flash --sandbox --output-format text 2>&1
   ```

## Output

Competitive analysis report with pattern comparison, gaps, and opportunities. Read-only.
