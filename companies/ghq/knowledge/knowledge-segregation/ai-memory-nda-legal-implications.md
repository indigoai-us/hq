---
title: "AI Assistant Memory and NDA Legal Implications"
category: knowledge-segregation
tags: ["security", "compliance", "context-management", "access-control", "personal-knowledge", "enterprise"]
source: https://simonhodgkins.medium.com/confidentiality-in-the-age-of-ai-28d0d2a1e602, https://outsidegc.com/blog/incorporating-ai-training-language-in-confidentiality-provisions/, https://www.avantialaw.com/news/ai-clauses-in-ndas-protecting-confidentiality-without-killing-collaboration, https://www.techpolicy.press/forget-me-forget-me-not-memories-and-ai-agents/, https://www.nolo.com/legal-encyclopedia/is-what-you-say-to-an-ai-chatbot-confidential.html, https://www.crowell.com/en/insights/client-alerts/federal-court-rules-some-ai-chats-are-not-protected-by-legal-privilege-what-it-means-for-you, https://contractnerds.com/7-ai-specific-confidentiality-clauses/, https://www.newamerica.org/oti/briefs/ai-agents-and-memory/, https://acuvity.ai/what-is-memory-governance-why-important-for-ai-security/, https://privacy.claude.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to, https://platform.claude.com/docs/en/build-with-claude/zero-data-retention, https://developers.openai.com/api/docs/guides/your-data, https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention, https://ai.google.dev/gemini-api/docs/zdr, https://arxiv.org/pdf/2510.11558
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T06:00:00Z
---

Whether AI context retention constitutes "information sharing" under NDAs is legally unsettled but increasingly litigated.

## Core Legal Question

Standard NDA and consulting agreements were drafted before AI assistants with persistent memory existed. They typically prohibit sharing confidential information with "third parties" and require keeping it confidential. The key unresolved question: does inputting client information into an AI tool count as disclosing it to a third party?

The current consensus among practitioners is: **yes, it likely does** — and the legal risk has been confirmed in adjacent case law even if no definitive NDA-specific ruling exists.

## Confirmed Case Law (2025–2026)

### Attorney-Client Privilege Loss

A federal court (Southern District of New York, early 2026) ruled that communications with a publicly available generative AI tool (Claude) are **not protected by attorney-client privilege**, even when later shared with lawyers. The reasoning:

1. AI is not an attorney — no lawyer-client relationship exists.
2. Sharing with a third-party AI provider destroys confidentiality, the same way disclosing to a non-Kovel third party waives privilege.
3. The provider's privacy policy (stating that inputs may be used for training and shared with regulators) eliminates any reasonable expectation of privacy.

The court left open a narrow exception: attorney-directed use of **enterprise AI platforms with contractual confidentiality controls** (analogous to the Kovel doctrine for non-lawyer agents of counsel).

### Third-Party Disclosure Risk

The same reasoning that strips attorney-client privilege applies to NDAs: by sending confidential data to an AI provider, you are disclosing it to a third party. Provider privacy policies typically reserve the right to:
- Use inputs for model training
- Share data with governmental/regulatory authorities
- Allow human review of conversations

## Why Most NDAs Don't Cover This

Traditional NDA language:
- Permits disclosure to "employees and agents" with a need to know
- Requires "reasonable steps" to protect confidentiality
- Was written assuming human-to-human information flows

AI tools fall into a gap: the consultant uses them as agents, but the AI provider is a third party the disclosing party never consented to. "Reasonable steps" didn't historically include prohibiting AI use.

## Emerging Contractual Safeguards

Legal practice is evolving quickly. AI-specific NDA clauses now commonly include:

| Clause Type | Purpose |
|-------------|---------|
| **Training prohibition** | Prohibits using confidential data to train or fine-tune AI models |
| **Retention limits** | Requires proof that the AI tool doesn't retain inputs beyond the session |
| **Prior consent for AI use** | Requires written approval before using any external AI service with sensitive data |
| **Data isolation requirement** | AI provider must demonstrate data isolation, encryption, and strict retention limits |
| **Audit rights** | Right to audit AI tooling used on the engagement |

Prediction: within 12–18 months, AI clauses will be standard in NDA templates.

## AI Memory Persistence: A New Risk Vector

Persistent cross-session AI memory (e.g., Claude Code's `~/.claude/` memory, ChatGPT memory features) introduces risks beyond the single-session context window:

- **Cross-client contamination**: Memories from Company A's project can surface in sessions for Company B.
- **Employment transition risk**: Work-related agent memories may follow a consultant to a new engagement or employer — existing employment contracts don't address this.
- **Session cross-leakage**: If one prompt includes payroll data, subsequent prompts in the same session may surface it again via indirect reference.
- **GDPR tension**: Indefinite storage of conversation data may violate GDPR Article 5 (data minimization / purpose limitation). Companies using AI memory features may be unknowingly non-compliant.

## Practical Risk Assessment for Consultants

| Scenario | Risk Level | Notes |
|----------|-----------|-------|
| Pasting client code into public ChatGPT/Claude | **High** | Clear third-party disclosure; possible NDA breach |
| Using enterprise AI (API with ZDR, no training) | **Medium** | Depends on contractual controls; closer to a Kovel exception |
| Local model (Ollama, etc.) with no external calls | **Low** | No third-party disclosure; still creates local retention risk |
| AI with persistent cross-session memory on client work | **High** | Memory persistence across clients = structural contamination risk |

## ZDR Provider Comparison

ZDR is offered differently across the major AI providers — critical detail for NDA compliance evaluation:

| Provider | ZDR Mechanism | Default Retention | Exceptions | Availability |
|----------|---------------|-------------------|------------|--------------|
| **Anthropic** | Negotiated enterprise agreement | 7 days (API logs) | Law compliance; safety classifier results always retained | Contact sales; not automatic |
| **OpenAI** | Negotiated enterprise agreement | 30 days (API) | Abuse monitoring excluded; law compliance | Contact sales; eligible endpoints only (no extended caching) |
| **Google Vertex AI** | Project-level config + optional ZDR | 24 hours (default caching) | Abuse monitoring cleared before logging under ZDR | Vertex AI only (not AI Studio); invoiced billing required |
| **Google Gemini API** | ZDR available for paid tiers | 24 hours | Same as Vertex AI | Developer API with paid plan |

### Key Nuance: What ZDR Doesn't Cover

Even with ZDR in place, all three providers retain the right to:
- Retain data required by law or regulatory order
- Run abuse/safety checks (though results may be cleared for Google under ZDR)
- Log metadata (request timestamps, token counts) for billing

**Anthropic specifically**: Safety classifier results are always retained even under ZDR, as they're needed to enforce the Usage Policy.

### Does ZDR Satisfy NDA Third-Party Disclosure Clauses?

The legal consensus is: **probably yes for well-drafted NDAs, but not guaranteed for legacy NDAs**.

**ZDR satisfies NDA obligations when:**
- The NDA's "third party" definition excludes processors with contractual confidentiality controls (analogous to a Kovel doctrine carve-out)
- The enterprise agreement includes explicit data processing addendums (DPAs) with processing-only language
- No training on inputs, no human review, no persistent storage — all contractually guaranteed

**ZDR may NOT satisfy NDAs when:**
- Legacy NDA language prohibits disclosure to any third party without exception — the data still *flows through* the provider's infrastructure even if not stored
- The NDA requires written consent for each AI tool used, regardless of retention policy
- The disclosing party hasn't acknowledged or approved the specific AI provider as a permitted processor
- Abuse monitoring exceptions technically allow provider staff to see flagged content

**Practical guidance**: For sensitive engagements, supplement ZDR with an explicit AI rider to the NDA that names the approved providers and their DPAs, rather than relying on ZDR alone to satisfy legacy "no disclosure" clauses.

## Mitigation Approaches

1. **Zero Data Retention (ZDR)**: Enterprise API tiers (Anthropic, OpenAI, Google Vertex AI) offer contractual guarantees that inputs are not stored or used for training. This is the clearest path to safe use under most NDAs — but requires explicit enterprise enrollment, not just API access.
2. **Project-scoped memory**: Ensure AI memory is isolated per client/project, not shared across contexts.
3. **Session isolation**: Fresh sessions per client — no carry-over of conversation history.
4. **Contract review**: Check existing consulting agreements for "third party" definitions and whether AI tools require written consent.
5. **Client disclosure**: Proactively inform clients which AI tools are used and obtain consent where required.

## Open Questions

- Whether passive inference (the AI learns patterns from data without storing specifics) constitutes disclosure.
- Whether using a local model avoids "third party" issues entirely, or whether the user's own notes/memory system creates a different duty.
- How arbitration clauses and choice of law provisions interact with AI-related NDA disputes across jurisdictions.
