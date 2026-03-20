---
description: Scaffold a new company — create folder, symlink, manifest entry, and subdirectories
allowed-tools: AskUserQuestion, Bash, Read, Write, Edit, Glob, Grep
---

# /new-company — Scaffold a New Company

Create a new company workspace with proper folder structure, symlink, and manifest entry.

## Step 1: Gather Company Details

Use `AskUserQuestion` to ask the user:

1. **Company name** — ask: "What is the company name?"
   - Options: let the user type freely (use 2 placeholder options like "Type company name below" and a second generic one, but the user will use Other to type the name).

Actually, since AskUserQuestion requires options, handle this conversationally:

**Ask the user the company name** using `AskUserQuestion` with the question "What is the name of the company?" — provide 2-3 example placeholder options but the user will likely use "Other" to type their own.

## Step 2: Suggest Slug

Take the company name and generate a slug (lowercase, hyphens, no special chars). Present it to the user via `AskUserQuestion`:

- Question: "Use this as the folder slug?"
- Option 1: The suggested slug (Recommended)
- Option 2: "Enter a different slug" — if chosen, ask again for the custom slug.

## Step 3: Choose Location

Ask the user where to create the company folder using `AskUserQuestion`:

- Detect the OS:
  - **macOS** (Darwin): suggest `~/Documents/GHQ/companies/<slug>`
  - **Windows**: suggest `C:\GHQ\companies\<slug>`
- Options:
  - Option 1: The default path for the detected OS (Recommended)
  - Option 2: "Choose a different location"

If the user picks a custom location, ask for it.

## Step 4: Create Everything

Once all inputs are gathered, execute these steps:

### 4a. Create the company folder and subdirectories

```bash
mkdir -p "<chosen-path>/knowledge" "<chosen-path>/data" "<chosen-path>/tools"
```

### 4b. Create symlink in GHQ companies/

Create a symlink from `companies/<slug>` (relative to the GHQ repo root) pointing to the chosen path:

```bash
ln -s "<chosen-path>" companies/<slug>
```

### 4c. Create qmd collection

Register the company's knowledge directory as a qmd collection so it's searchable:

```bash
qmd collection add "<chosen-path>/knowledge" --name <slug> --mask "**/*.md"
```

### 4d. Create or update companies/manifest.yaml

If `companies/manifest.yaml` doesn't exist, create it with this structure:

```yaml
# GHQ Company Manifest
# Single source of truth for company -> resource mapping

companies: {}
```

Then add the new company entry:

```yaml
companies:
  <slug>:
    name: "<Company Name>"
    path: "<chosen-path>"
    created_at: "<ISO 8601 timestamp>"
```

If the manifest already exists, append the new company entry under the `companies:` key. Do NOT overwrite existing entries.

## Step 5: Confirm

Print a summary:

```
## Company Created

- Name: <Company Name>
- Slug: <slug>
- Path: <chosen-path>
- Symlink: companies/<slug> -> <chosen-path>
- Manifest: companies/manifest.yaml updated
- qmd collection: <slug> -> <chosen-path>/knowledge/ (**/*.md)

Folders created:
- <chosen-path>/knowledge/
- <chosen-path>/data/
- <chosen-path>/tools/
```

## Rules

- Never overwrite an existing company in the manifest.
- If `companies/<slug>` symlink already exists, warn the user and ask before proceeding.
- Always use `AskUserQuestion` for user input — never inline questions in chat text.
