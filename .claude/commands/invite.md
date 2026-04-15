# /invite — Create Membership Invite

Send a vault-backed membership invite. Creates a pending membership and returns a magic link.

**Usage:**
```
/invite <email-or-handle> [--role <owner|admin|member|guest>] [--paths <docs/,shared/>] [--company <slug>]
/invite --list [--company <slug>]
/invite --revoke <token-or-membership-key>
```

## Process

1. **Resolve auth** — read Cognito session from `~/.hq/credentials.json`
2. **Resolve company** — from `--company` flag, or active company via `.hq/config.json`
3. **Validate args** — `--paths` is only valid with `--role guest`
4. **Call vault-service** — via `VaultClient.createInvite()` from `@indigoai-us/hq-cloud`
5. **Print magic link** — `hq://accept/<token>`

## Implementation

```typescript
import { invite, listInvites, revokeInvite } from "@indigoai-us/hq-cloud";
```

### Create invite
```typescript
const result = await invite({
  target: "<email-or-handle>",
  role: "member",        // default
  paths: "docs/,shared/", // only with role=guest
  company: "<slug>",
  vaultConfig: { apiUrl, authToken },
  callerUid: "<caller-person-uid>",
});

console.log(`Magic link: ${result.magicLink}`);
console.log(`Token: ${result.inviteToken}`);
```

### List pending invites
```typescript
const pending = await listInvites({
  company: "<slug>",
  vaultConfig: { apiUrl, authToken },
  callerUid: "<caller-person-uid>",
});
```

### Revoke invite
```typescript
await revokeInvite({
  tokenOrKey: "<token-or-membership-key>",
  vaultConfig: { apiUrl, authToken },
});
```

## Output Format

### On success:
```
Invite created for alice@example.com (role: member)

Magic link: hq://accept/tok_abc123...
Share this link with the invitee. They can accept with:
  /accept hq://accept/tok_abc123...

Pending invites for acme: 3 total
```

### On permission error:
```
Permission denied — only admins and owners can invite members.
Your current role on "acme" does not permit invitations.
```

### On validation error:
```
Error: --paths is only valid with --role guest
(allowedPrefixes are only meaningful for the guest role)
```

## Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full control + delete entity |
| `admin` | Manage members + read/write all |
| `member` | Read/write unrestricted paths (default) |
| `guest` | Scoped to `--paths` prefixes only |

## Notes

- Only `admin` and `owner` roles can create invites
- Magic link tokens are 32+ byte cryptographic tokens from VLT-6
- `hq://accept/<token>` is the Day 1 protocol — upgradable to HTTPS later
- Pending invites live until accepted or revoked (no expiry on Day 1)
