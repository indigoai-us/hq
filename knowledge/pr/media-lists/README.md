# Media Lists

JSONL databases for journalists and media outlets.

## Journalist Schema (`journalists.jsonl`)
```json
{
  "name": "string",
  "outlet": "string",
  "beat": "string (e.g. 'AI', 'SaaS', 'fintech', 'enterprise')",
  "email": "string",
  "x_handle": "string (without @)",
  "linkedin": "string (profile URL)",
  "tier": "number (1=national, 2=industry, 3=niche)",
  "last_contact": "string (ISO date or null)",
  "notes": "string",
  "segments": ["string (e.g. 'ai-reporters', 'saas-trade')"],
  "status": "string (active|moved|inactive)",
  "company_tags": ["string (e.g. '{company-1}', '{company-2}', '{company-3}')"]
}
```

## Outlet Schema (`outlets.jsonl`)
```json
{
  "name": "string",
  "type": "string (publication|blog|podcast|newsletter)",
  "url": "string",
  "tier": "number (1-3)",
  "beats": ["string"],
  "audience": "string (description)",
  "pitch_guidelines": "string (submission URL or notes)",
  "contacts": ["string (journalist names)"]
}
```

## Tiering System
- **Tier 1:** National reach, 100K+ monthly readers (TechCrunch, Wired, Forbes Tech)
- **Tier 2:** Industry-specific, 10K-100K readers (SaaStr, Protocol, Built In)
- **Tier 3:** Niche blogs, newsletters, podcasts (under 10K but highly targeted)
