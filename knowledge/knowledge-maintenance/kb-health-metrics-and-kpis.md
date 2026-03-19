---
title: "Knowledge Base Health Metrics and KPIs"
category: knowledge-maintenance
tags: ["knowledge-management", "monitoring", "retrieval", "staleness", "benchmarks"]
source: https://www.liveagent.com/blog/knowledge-management-metrics/, https://www.helpscout.com/blog/knowledge-base-metrics/, https://cobbai.com/blog/knowledge-base-content-quality, https://www.manageengine.com/products/service-desk/itsm/knowledge-management-kpi-metrics.html, https://labelyourdata.com/articles/llm-fine-tuning/rag-evaluation, https://www.evidentlyai.com/llm-guide/rag-evaluation
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Quantitative KPIs for assessing whether a knowledge base is healthy, current, and findable.

## Metric Categories

| Category | What It Measures |
|----------|-----------------|
| **Freshness** | How current the content is |
| **Coverage** | Whether gaps exist relative to demand |
| **Retrieval quality** | How well users find what they need |
| **Impact** | Whether the KB reduces support burden |

---

## Freshness Metrics

### Staleness Ratio
`stale_articles / total_articles`

Articles are "stale" once they exceed a review threshold (commonly 6–12 months without update). Target: **< 15% stale**.

### Average Article Age
Mean time since last edit across all articles. A rising average signals maintenance debt.

### Review Cadence
- High-traffic articles: quarterly review
- Long-tail articles: biannual review
- Target: 20–30% of articles reviewed per quarter (for active KBs)

### Freshness Index
Some platforms compute a weighted freshness score: `Σ(article_views × recency_weight)`. Higher weight on frequently accessed stale articles.

---

## Coverage Metrics

### Zero-Results Rate
`searches_with_no_results / total_searches`

Directly shows coverage gaps. Target: **< 5%**. High rates mean the KB doesn't cover topics users are actually asking about.

### Low-Click-Through Rate Searches
Queries that return results but users don't click any — signals relevance gaps even when content exists.

### Ticket-to-Article Ratio
`new_support_tickets / articles_created_this_period`

Measures whether article creation keeps pace with incoming demand.

### Topic Coverage Completeness
Manual or automated audit: compare KB topics against a known taxonomy/topic list. Expressed as `covered_topics / total_topics`.

---

## Retrieval Quality Metrics

### Search Success Rate
`sessions_with_successful_search / total_search_sessions`

A session is "successful" if the user clicks a result and doesn't immediately bounce.

### Mean Reciprocal Rank (MRR)
`1 / rank_of_first_relevant_result` averaged across queries. Measures whether relevant content surfaces at the top. Target: **> 0.7**.

### Precision@K / Recall@K (for RAG/vector KBs)
- **Precision@K**: fraction of top-K retrieved docs that are actually relevant
- **Recall@K**: fraction of all relevant docs captured in top-K
- Standard RAG evaluation targets: Precision@5 > 0.7, Recall@10 > 0.8

### Deflection Rate (Self-Service Rate)
`tickets_deflected / (tickets_deflected + tickets_submitted)`

The definitive ROI metric. Measures how often KB access replaces a support ticket. Industry benchmark: **30–50%** deflection for mature KBs.

---

## Impact Metrics

### Article Usefulness Rating
User thumbs-up/thumbs-down ratings per article. Articles below 60% positive rating are candidates for revision or removal.

### Reuse Rate
How often existing articles are cited or linked internally vs. new articles created for the same topic.

### Mean Time to Answer
Time from search initiation to user finding their answer. Proxy: session duration before successful click.

---

## Composite Health Score

A simple composite for internal KBs:

```
health_score = (
  0.3 × (1 - staleness_ratio)
  + 0.3 × (1 - zero_results_rate)
  + 0.2 × search_success_rate
  + 0.2 × deflection_rate
)
```

Weights can be adjusted based on KB purpose (support vs. internal docs vs. RAG pipeline).

---

## Thresholds Summary

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Staleness ratio | < 15% | 15–30% | > 30% |
| Zero-results rate | < 5% | 5–15% | > 15% |
| Search success rate | > 75% | 50–75% | < 50% |
| Deflection rate | > 40% | 20–40% | < 20% |
| MRR | > 0.7 | 0.5–0.7 | < 0.5 |

---

## RAG-Specific Additions

For KB-backed LLM pipelines, add:

- **Context Precision**: fraction of retrieved chunks actually used in the final answer
- **Faithfulness**: whether the generated answer is grounded in retrieved docs (no hallucination)
- **Answer Relevance**: semantic similarity of answer to the original question
- Tools: Ragas, ARES, EvidentlyAI

---

## Sources

- [LiveAgent: Knowledge Management Metrics](https://www.liveagent.com/blog/knowledge-management-metrics/)
- [Help Scout: Knowledge Base Metrics](https://www.helpscout.com/blog/knowledge-base-metrics/)
- [Cobbai: Content Quality & Freshness](https://cobbai.com/blog/knowledge-base-content-quality)
- [ManageEngine: KM KPIs](https://www.manageengine.com/products/service-desk/itsm/knowledge-management-kpi-metrics.html)
- [Label Your Data: RAG Evaluation 2026](https://labelyourdata.com/articles/llm-fine-tuning/rag-evaluation)
- [EvidentlyAI: RAG Evaluation Guide](https://www.evidentlyai.com/llm-guide/rag-evaluation)
