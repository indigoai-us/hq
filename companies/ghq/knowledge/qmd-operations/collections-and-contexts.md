---
title: "QMD Collections and Context Hierarchy"
category: qmd-operations
tags: ["qmd", "knowledge-management", "information-architecture", "retrieval"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

QMD organizes indexed content into **collections** — named groups of files rooted at a filesystem path with an optional glob mask. Collections are created via `qmd collection add <path> --name <name>` and can be filtered during search with `-c <name>`.

**Contexts** are hierarchical text annotations attached to paths in the `qmd://` namespace. When a search returns documents under a path that has context, that context is included in results. The README describes this as "the key feature of QMD" because it allows LLMs to make better contextual choices when selecting documents. Contexts form a tree: `qmd context add qmd://notes "Personal notes"` annotates everything under the notes collection.

This is particularly powerful for agentic workflows where an LLM receives search results and needs to understand not just what matched, but the broader purpose of the collection containing the match. For GHQ, this means collections can carry descriptions like "Work documentation" or "Meeting transcripts" that help Claude disambiguate results from different knowledge domains.

Collections can be listed (`qmd collection list`), removed, and renamed. The `qmd update` command re-indexes all collections, with `--pull` optionally running `git pull` first for git-backed collections. `qmd status` shows index health and collection info.
