# Public Workers

> Auto-generated. Updated: 2026-04-07

| Name | Description |
|------|-------------|
| `accessibility-auditor/` | WCAG 2.2 AA auditing -- keyboard nav, screen reader, zoom, contrast |
| `content-brand/` | Content worker -- brand voice and tone alignment |
| `content-legal/` | Content worker -- regulatory compliance scanning |
| `content-product/` | Content worker -- product feature and claim accuracy |
| `content-sales/` | Content worker -- conversion copy and CTA analysis |
| `content-shared/` | Shared library (CLI, types, test harness) for content workers |
| `dev-team/` | 20 sub-workers -- PM, task executor, architect, devs, QA, Codex, Gemini |
| `exec-summary/` | McKinsey SCQA executive summaries -- strict word limits, quantified findings |
| `frontend-designer/` | UI generation with v0/design tools |
| `gardener-team/` | 3 sub-workers -- garden-auditor, garden-curator, garden-scout |
| `gemini-coder/` | Gemini CLI code generation -- scaffolding, features, refactoring |
| `gemini-designer/` | Gemini CLI design system analysis -- tokens, consistency, visual diffs |
| `gemini-frontend/` | Gemini CLI frontend -- components, styling, responsive, a11y |
| `gemini-reviewer/` | Gemini CLI code review -- PR review, security scan, suggestions |
| `gemini-stylist/` | Gemini CLI CSS/animation -- animations, dark mode, responsive polish |
| `gemini-ux-auditor/` | Gemini CLI UX audit -- heuristic evaluation, flow review, copy review |
| `gstack-sprint/` | gstack sprint runner for batch code operations |
| `impeccable-designer/` | High-craft design worker using design-styles knowledge (deprecated — use dev-team/frontend-dev + design-styles) |
| `knowledge-tagger/` | Knowledge file tagging using ontology-aligned taxonomy |
| `paper-designer/` | Paper design tool worker using design-styles knowledge |
| `performance-benchmarker/` | Core Web Vitals, load testing, capacity planning -- k6, Lighthouse |
| `pretty-mermaid/` | Renders Mermaid diagrams to SVG or ASCII with 14 professional themes |
| `qa-tester/` | Adversarial website testing -- defaults to FAIL, requires screenshot evidence |
| `sample-worker/` | Template worker demonstrating best practices for worker documentation |
| `security-scanner/` | Pre-deploy PII/credential detection for public repositories |
| `site-builder/` | Static site builder using local-biz-sites templates |
| `social-publisher/` | Posts approved content via Post-Bridge API with safety checks |
| `social-reviewer/` | Quality gate -- reviews drafts, validates safety, sets approved status |
| `social-shared/` | Shared utilities for social team (safety, queue ops, Post-Bridge) |
| `social-strategist/` | Content planning and draft creation with profile awareness |
| `social-verifier/` | Delivery verification -- confirms posts are live via agent-browser |

Run workers via `/run {id}`.
