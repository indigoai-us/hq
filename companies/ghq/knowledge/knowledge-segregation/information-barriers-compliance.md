---
title: "Information Barriers and Compliance for Consultants"
category: knowledge-segregation
tags: ["security", "compliance", "knowledge-management", "enterprise", "access-control", "rbac"]
source: blueprint, https://learn.microsoft.com/en-us/purview/information-barriers, https://stiltsoft.com/blog/role-based-access-control-rbac-in-confluence-cloud/, https://www.notion.com/help/guides/notion-enterprise-security-provisions, https://blog.admindroid.com/how-information-barriers-strengthen-microsoft-365-security/
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T22:30:00Z
---

Information barriers (historically called "Chinese walls") are organizational controls that prevent the flow of confidential information between different parts of an entity. Originally from finance (preventing conflicts between advisory and trading divisions), the concept applies directly to consultants and freelancers working across competing or sensitive clients.

Enterprise KM platforms implement information barriers through layered access control models — most use RBAC as the base with ABAC extensions for dynamic/attribute-sensitive policies.

## How Enterprise Platforms Implement Barriers

### Confluence (Atlassian)

Three-tier permission hierarchy:

| Level | Scope | Who Controls |
|-------|-------|-------------|
| **Global** | Site-wide access, space creation, admin | Site admins |
| **Space** | Per-space view/edit/delete/admin | Space admins |
| **Page** | Restrictions on individual pages | Page authors |

Permissions are assigned to users, groups, or anonymous users. Even with space access, page-level restrictions can block specific content. Atlassian is migrating to **role-based space management** (2024 Early Access) — eventually all space permissions managed via roles, with custom roles definable at site level.

**Data security policies** allow controlling how external users and apps interact with content, including blocking anonymous access and export restrictions.

### Notion (Enterprise)

Notion uses **teamspace isolation** as the primary barrier mechanism:

- **Restricted members** (Enterprise plan only): Must be explicitly added to specific teamspaces and pages. Cannot create teamspaces. Can only share with members in their same teamspaces — prevents lateral information movement.
- **Permission levels**: Workspace owner → Membership admin → Member → Guest, each with narrower rights.
- **DLP integration**: Notion Enterprise integrates with Nightfall AI and Polymer for DLP/SIEM monitoring.
- **Controls**: Admins can disable exports, guest invites, and public sharing at workspace level.

### Microsoft 365 / SharePoint (Purview Information Barriers)

Microsoft has the most formal "information barrier" feature (part of Microsoft Purview):

- **Segment-based policies**: Users are assigned to named segments (e.g., "Equity Research", "Investment Banking"). Policies define which segments can communicate.
- **Two enforcement modes**:
  - **Implicit**: Access via M365 group membership — not in the group = no access.
  - **Explicit**: Site segment must match user segment; mismatches are auto-remediated.
- **Compliance assistant**: Automatically removes users whose segments no longer match a site's policy — continuous enforcement, not just at-access-time.
- **Scope**: Applies across Teams, SharePoint, and OneDrive — communication and file-sharing barriers enforced uniformly.

### Google Workspace

Google approaches barriers primarily through **organizational units (OUs)** and **data regions**, not a formal information barriers feature:

- Admins partition users into OUs; sharing policies and app access differ per OU.
- **Data regions** (US/EU): Can be set per OU or group on Enterprise Plus — enables geographic data segregation.
- **Assured Controls**: Add-on that restricts which Google support staff can access org data (sovereignty controls).
- No native equivalent to Microsoft's segment-based IB policies.

## Access Control Model Comparison

| Model | How it works | Best for |
|-------|-------------|---------|
| **RBAC** | Roles assigned to users; permissions to roles | Stable org structures |
| **ABAC** | Attributes (user, resource, context) evaluated at runtime | Dynamic, regulated environments |
| **ReBAC** | Permissions based on relationships between entities | Hierarchical content (Google Zanzibar) |
| **Hybrid** | RBAC for coarse-grained, ABAC for fine-grained | Enterprise multi-tenant SaaS |

Most enterprise KM platforms use RBAC as the base with ABAC extensions for context-sensitive rules (e.g., time-of-day, device compliance). Multi-tenant SaaS systems typically use a shared policy store rather than per-tenant stores, injecting tenant ID as an attribute at evaluation time.

## Relevance to AI-Assisted Work

When using AI coding assistants across multiple clients:

1. **NDA obligations**: Most consulting agreements prohibit sharing client information with third parties. An AI assistant that retains context from client A while working on client B creates a potential NDA breach — even if the "sharing" is only within the consultant's own tooling.

2. **Competitive sensitivity**: Two clients in the same industry may have proprietary approaches. Cross-pollination through AI suggestions (e.g., "I've seen a pattern like this...") could expose trade secrets.

3. **Audit trail**: Some regulated industries require demonstrable information barriers. Being able to show that your AI tooling enforces segregation may be a compliance requirement.

## Gaps vs. Enterprise Platforms

Enterprise platforms enforce barriers at the **storage/access layer** (who can retrieve what). For AI assistants, the gap is at the **context layer** — information flows through the LLM's context window regardless of file permissions. Technical controls (directory isolation, separate qmd collections) approximate but don't fully replicate enterprise IB enforcement.

## Open Questions

- Whether AI assistant memory constitutes "information sharing" under typical NDA language is legally untested territory.
- How to balance the legitimate benefit of general knowledge accumulation (learning patterns, not specifics) against segregation requirements.
- Whether technical controls (directory isolation, collection scoping) are sufficient for compliance, or whether policy/process controls are also needed.
