---
description: Assign a content pack to a user or role — controls which files they receive on sync (admin only)
allowed-tools: Bash, Read
argument-hint: <user-email-or-id|role:member> <pack-name> [--team <slug>] [--revoke]
visibility: public
---

# /assign-pack - Assign Content Pack to User or Role

Admin command. Updates the entitlements manifest to grant (or revoke) a content pack for a specific user or role. On the member's next `hq team-sync`, their sparse checkout will be updated to include the pack's file paths.

**Arguments:** $ARGUMENTS

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- First positional arg — user identifier: email, user ID (`sub_...`), or role key (e.g., `role:member`)
- Second positional arg — pack name to assign (must exist in the entitlements manifest)
- `--team <slug>` — team slug (required if multiple teams)
- `--revoke` — remove the pack from the user instead of adding it

If fewer than 2 positional args provided: stop and print usage.

## Step 2: Resolve Team

```bash
find ~/hq/companies -name "team.json" -maxdepth 2 2>/dev/null
```

- If `--team <slug>` provided: use `~/hq/companies/{slug}/team.json`
- If only one team: use it
- If multiple teams and no flag: list them and stop

Read `team_id` and `team_name` from `team.json`.

## Step 3: Load Auth Token

```bash
TOKEN=$(cat ~/.hq/auth.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('clerk_session_token',''))" 2>/dev/null)
```

If empty: `Error: Not authenticated. Run: hq login`

## Step 4: Fetch Current Entitlements Manifest

```bash
TEAM_ID=$(cat ~/hq/companies/{slug}/team.json | python3 -c "import sys,json; print(json.load(sys.stdin)['team_id'])")

RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "https://hq.indigoai.com/api/teams/${TEAM_ID}/entitlements" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
```

If HTTP_CODE is 403: `Error: Only team admins can manage entitlements.`
If HTTP_CODE is not 200: print error and stop.

Parse `packs` and `assignments` from the response body.

**If `packs` is empty / no manifest exists:**
```
Error: No entitlements manifest found for {team_name}.
An admin must create the manifest first with the full pack definitions.
See: https://hq.indigoai.com/docs/teams/entitlements
```

## Step 5: Validate Pack Name

Check that the requested `{pack-name}` exists in `manifest.packs`.

If not found:
```
Error: Pack "{pack-name}" not found in {team_name} entitlements.

Available packs:
  {pack-name}    {description}    ({paths.length} paths)
  {pack-name}    {description}    ({paths.length} paths)
  ...
```

## Step 6: Resolve User Key

The assignment key in the manifest is either:
- A user ID (Cognito `sub`) — format: UUID-like string
- A role key — format: `role:{rolename}` (e.g., `role:member`, `role:admin`)
- Potentially an email (if stored that way by the team)

Parse the first argument:
- If it starts with `role:` → use as-is (e.g., `role:member`)
- If it looks like a UUID / Cognito sub → use as-is
- If it looks like an email → use as-is (the API stores what you give it)

Store this as `{assignment-key}`.

## Step 7: Compute Updated Assignments

Start with the current `assignments` object from the manifest.

**Assign (default):**
- If `{assignment-key}` is not in `assignments`: create it with `["{pack-name}"]`
- If `{assignment-key}` exists: add `{pack-name}` to the array if not already present
- If already assigned: print info and stop:
  ```
  {assignment-key} already has pack "{pack-name}" assigned.
  No changes made.
  ```

**Revoke (`--revoke`):**
- If `{assignment-key}` is not in `assignments` or pack not in their list: print info and stop:
  ```
  {assignment-key} does not have pack "{pack-name}" assigned.
  No changes made.
  ```
- Otherwise: remove `{pack-name}` from their array
- If their array becomes empty after removal: remove the key entirely from `assignments`

## Step 8: Confirm and Save

Print what will change:

**Assign:**
```
Assign pack "{pack-name}" to {assignment-key}?
──────────────────────────────────────────────────
Team:   {team_name}
Pack:   {pack-name} — {description}
Paths:  {N} file paths (e.g., {first 3 paths})
User:   {assignment-key}

Members will receive these files on their next `hq team-sync`.
Confirm? [y/N]
```

**Revoke:**
```
Revoke pack "{pack-name}" from {assignment-key}?
──────────────────────────────────────────────────
Team:   {team_name}
Pack:   {pack-name}
User:   {assignment-key}

These files will no longer sync to the member's HQ.
Confirm? [y/N]
```

Wait for confirmation before proceeding.

## Step 9: PUT Updated Manifest

Build the updated manifest with the new `assignments`:

```bash
UPDATED_MANIFEST=$(echo "${BODY}" | python3 -c "
import sys, json
manifest = json.load(sys.stdin)
assignments = manifest.get('assignments', {})
key = '{assignment-key}'
pack = '{pack-name}'
# [apply the add or remove logic here]
manifest['assignments'] = assignments
print(json.dumps(manifest))
")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://hq.indigoai.com/api/teams/${TEAM_ID}/entitlements" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${UPDATED_MANIFEST}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
```

## Step 10: Handle Response

### Success (HTTP 200)

**Assign:**
```
Pack assigned
─────────────────────────────────────────────────
Team:   {team_name}
User:   {assignment-key}
Pack:   {pack-name}

{assignment-key} will receive {N} additional file paths on their next sync.
Their current packs: {list of all their assigned packs}

Next steps:
  Member runs: hq team-sync --team {slug}
  Check all assignments: /assign-pack --list --team {slug}
```

**Revoke:**
```
Pack revoked
─────────────────────────────────────────────────
Team:   {team_name}
User:   {assignment-key}
Pack:   {pack-name} (removed)

{assignment-key}'s remaining packs: {list or "(none)"}
```

### Error Cases

**HTTP 400 (validation error):**
```
Error: {error message from API}
```

**HTTP 403 (not admin):**
```
Error: Only team admins can manage entitlements.
```

**HTTP 404 (team not found):**
```
Error: Team not found — check team.json is correct.
```

## Listing Mode

If called with `--list` (no user/pack args):

```bash
/assign-pack --list --team {slug}
```

Fetch the manifest and display:

```
Entitlements — {team_name}
──────────────────────────────────────────────────

Packs:
  {pack-name}    {description}
    Paths: {path1}, {path2}, ... ({N} total)

Assignments:
  {user-or-role}    {pack1}, {pack2}
  role:member       {pack1}
  ...

(No assignments yet)
```

## Error Handling

| Error | Action |
|-------|--------|
| Not authenticated | Stop — `hq login` |
| Not admin | Clear 403 error |
| Pack not found | List available packs |
| Already assigned | Info message, no change |
| Not assigned (revoke) | Info message, no change |
| No manifest exists | Error with setup instructions |

## Examples

```
/assign-pack alice@company.com core-skills
/assign-pack alice@company.com advanced-pack --team acme
/assign-pack role:member core-skills --team acme       # Assign to all members by default
/assign-pack alice@company.com advanced-pack --revoke  # Remove a pack
/assign-pack --list                                     # Show all packs and assignments
/assign-pack --list --team acme
```

## Notes

- This command updates the full entitlements manifest via `POST /api/teams/{id}/entitlements` — the API replaces the entire manifest, so it reads current state first before writing
- Changes take effect on the member's next `hq team-sync` — sparse checkout is updated automatically
- The `role:member` key assigns packs to all team members by default (resolved server-side)
- Direct user assignments (`userId`) override role-based ones (both are applied, union of paths)
- To define new packs (not just assign existing ones), edit the manifest directly via the API or HQ admin UI
