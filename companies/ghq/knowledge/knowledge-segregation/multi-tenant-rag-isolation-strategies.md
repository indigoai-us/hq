---
title: "Multi-Tenant RAG Isolation Strategies"
category: knowledge-segregation
tags: ["retrieval", "security", "enterprise", "vector-search", "runtime-isolation"]
source: https://www.pinecone.io/learn/series/vector-databases-in-production-for-busy-engineers/vector-database-multi-tenancy/, https://milvus.io/blog/build-multi-tenancy-rag-with-milvus-best-practices-part-one.md, https://aws.amazon.com/blogs/machine-learning/multi-tenant-rag-implementation-with-amazon-bedrock-and-amazon-opensearch-service-for-saas-using-jwt/, https://www.thenile.dev/blog/multi-tenant-rag, https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/secure-multitenant-rag
confidence: 0.9
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Three primary strategies exist for enforcing tenant isolation in RAG systems, each with distinct tradeoffs in cost, latency, and security strength.

## Isolation Strategies

### 1. Separate Indexes (Database-per-Tenant)

Each tenant gets a dedicated vector index or database instance.

**Pros:**
- Strongest isolation: queries physically cannot touch another tenant's vectors
- Independent scaling per tenant — one tenant's traffic spike doesn't affect others
- Simpler access control: authenticate to the index = authenticate to the data
- Easier compliance: data residency and encryption keys per tenant

**Cons:**
- High operational cost at scale (1000s of tenants = 1000s of indexes)
- Cold-start latency for rarely-used tenants
- Resource underutilization for small tenants

**When to use:** Regulated industries, high-value enterprise customers, strict compliance requirements.

### 2. Filtered Queries (Shared Index with Metadata Filters)

All tenants share one index; a `tenant_id` metadata field is applied at query time.

```python
results = index.query(
    vector=query_embedding,
    filter={"tenant_id": {"$eq": current_tenant_id}},
    top_k=10
)
```

**Pros:**
- Simple to implement and operate
- Economical for large numbers of small tenants
- Single index to maintain

**Cons:**
- Query scans entire index before filtering — O(N_total) not O(N_tenant)
- Latency degrades as index grows
- Filter enforcement must be airtight — a missing filter = cross-tenant leak
- Side-channel attacks: query timing can reveal dataset size

**Risk:** 83% of RAG systems in multi-tenant environments have been found to suffer from cross-tenant data leakage when relying solely on application-layer filter enforcement.

### 3. Embedding Namespaces / Partitions

A middle ground: logical partitions within a single database, where each namespace/partition holds only one tenant's vectors.

**Pinecone namespaces:** Same index, but queries are routed to a specific namespace. No scan outside that partition.
**Milvus partitions:** Physical data sharding within a collection, with tenant lifecycle APIs.
**Weaviate multi-tenancy:** Tenant-aware classes with dedicated shards and ACL enforcement.
**Qdrant named collections with quotas:** First-class tenant lifecycle with rate controls.

**Pros:**
- Stronger isolation than filter-only (the search algorithm can't see outside its partition)
- Better query performance than shared filtered index
- More economical than fully separate databases

**Cons:**
- Vendor-specific APIs and semantics
- Cross-partition queries require federation
- Still shares infrastructure (cluster failures affect all tenants)

## Layered Defense Pattern

No single mechanism is sufficient. Production systems combine:

1. **Auth layer:** JWT or API key scoping to tenant ID
2. **Index layer:** Namespace or partition assignment at ingestion
3. **Query layer:** Metadata filter as belt-and-suspenders
4. **Output layer:** Post-retrieval access check before including in context
5. **Audit layer:** Log all retrievals with tenant ID for forensic tracing

The principle: *assume any single defense can fail; design so that no single failure is enough to leak cross-tenant data.*

## Security Risks Specific to Vector Databases

- **Embedding inversion attacks:** Embeddings can reconstruct sensitive source text (researchers recovered patient records from medical embeddings with 85%+ accuracy). Encryption at rest is necessary, not optional.
- **Public exposure:** 12,000+ vector database instances are exposed on the public internet with no authentication.
- **LLM prompt leakage:** Retrieved cross-tenant context injected into LLM prompt can be extracted via jailbreak, even if the UI filters output.

## Decision Matrix

| Requirement | Strategy |
|---|---|
| Strict compliance / regulated data | Separate indexes |
| 10k+ small tenants, cost-sensitive | Filtered queries (with defense-in-depth) |
| 100–1000 tenants, moderate isolation | Namespaces / partitions |
| Mixed (tiers by customer value) | Hybrid: dedicated for enterprise, shared for free tier |

## GHQ Relevance

QMD uses `-c <company>` collection-scoping as a namespace-style isolation mechanism. The `ghq` vs `indigo` separation prevents cross-company retrieval at the index layer. This maps to the Namespace strategy — strong enough for trusted operator use, not for untrusted multi-tenant SaaS.
