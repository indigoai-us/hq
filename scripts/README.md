# HQ Demo & Verification Scripts

End-to-end scripts that prove the HQ vault stack works against a live deploy.
Each script is `tsx`-runnable, parameterless by default, and tears nothing
down so you can inspect resources after a run.

## Which one do I run?

| Script | When to use it | Runtime |
|---|---|---|
| `e2e-create-company-smoke.ts` | "Does the entire flow work right now?" Smallest possible artifact that exercises sign-in → company provisioning → push → pull. Run this first if anything looks wrong. | ~15s cached / ~5min cold |
| `vlt-e2e-full-lifecycle.ts` | VLT-9 US-003 acceptance gate. 9-step lifecycle: create → invite 2 → accept × 2 → promote → revoke → goClaw task → audit → teardown. Run before tagging a release. | ~3min |
| `verify-hq-sync.ts` | Targeted sync verification only — assumes a company already exists. | ~10s |

---

## `e2e-create-company-smoke.ts` — the "does it work" runbook

### What it proves

A single run touches every load-bearing surface of the HQ vault stack:

| Phase | What it exercises | Failure tells you |
|---|---|---|
| 0. Cognito sign-in | Hosted UI / cached token / refresh path | Cognito client misconfigured (wrong callback URLs, expired tokens) |
| 1. `createCompanyFlow` | `/persons` `/companies` `/buckets` `/memberships` + STS verify + `.hq/config.json` write | vault-service handler chain, IAM role wiring, KMS provisioning |
| 2+3. Local edit + `share()` | `collectFiles()` walker + S3 `PutObject` via vended STS | STS scope policy too narrow, ignore rules over-blocking |
| 4. Verify in S3 | `HeadObject` + `GetObject` round-trip | KMS read perms, bucket policy |
| 5+6. Remote edit + `sync()` | `uploadFile()` (simulated other-device PUT) + `ListObjectsV2` + per-file download | sync conflict resolution, manifest journaling |
| 7. Local-vs-remote byte check | `fs.readFileSync` against expected bytes | Local cache invalidation, content-encoding mismatch |

If all 7 phases pass and the script exits 0, the entire flow that the user
asked for is provably working: Cognito auth → company in S3 → local file →
S3 → another-device edit → local sync.

### Prerequisites

- **AWS:** stack already deployed to the `stefanjohnson` stage of `hq-pro`.
  (See defaults in the Config section of the script.) No local AWS creds
  required — the script uses vault-vended STS only.
- **1Password:** entry **"Test New HQ"** in the **Personal** vault holds the
  password for `stefan@getindigo.ai`. Required only on a *cold* run (when no
  cached token exists in `~/.hq/cognito-tokens.json`).
- **Node:** any version that supports `tsx` (project pins via `package.json`).
- **Free port:** `8765` on `127.0.0.1`. The Cognito client also accepts
  `3000` and `53682` if you override `COGNITO_CALLBACK_PORT`.

### How to run

```bash
cd ~/hq/companies/indigo/repos/hq
npx tsx scripts/e2e-create-company-smoke.ts
```

To run against different defaults, override via env:

```bash
HQ_ROOT=/tmp/hq-throwaway \
COMPANY_SLUG=demo-co \
COMPANY_NAME="Demo Co" \
PERSON_EMAIL=you@example.com \
PERSON_NAME="You" \
COGNITO_CALLBACK_PORT=53682 \
npx tsx scripts/e2e-create-company-smoke.ts
```

All env overrides:

| Var | Default | Purpose |
|---|---|---|
| `AWS_REGION` | `us-east-1` | Region of vault-service stack |
| `COGNITO_DOMAIN` | `hq-vault-dev` | User Pool domain prefix |
| `COGNITO_CLIENT_ID` | `4mmujmjq3srakdueg656b9m0mp` | App Client ID |
| `COGNITO_CALLBACK_PORT` | `8765` | Loopback port for OAuth callback |
| `VAULT_API_URL` | API GW URL of `stefanjohnson` stage | vault-service base URL |
| `HQ_ROOT` | `~/hq-demo-flow` | Where the local HQ tree gets written |
| `COMPANY_SLUG` | `indigo-demo-flow` | Bucket-naming-safe slug |
| `COMPANY_NAME` | `Indigo Demo Flow` | Human label |
| `PERSON_EMAIL` | `stefan@getindigo.ai` | Cognito sign-in email |
| `PERSON_NAME` | `Stefan Johnson` | Person entity display name |

### What success looks like

A clean run prints something like this and exits with code 0:

```
════════════════════════════════════════════════════════════════════════
  ✓  END-TO-END DEMO PASSED — 17.3s
════════════════════════════════════════════════════════════════════════
  personUid:  prs_01KP9VV2PWTNRJW3EQ2DVGP6E7
  companyUid: cmp_01KP9VV3DY4FC0W133YV3MK9F6
  bucket:     hq-vault-cmp-01kp9vv3dy4fc0w133yv3mk9f6
  test key:   companies/indigo-demo-flow/demo-flow.md

  Round-trip verified:
    local → share → S3 ✓
    S3 PUT (other device) → sync → local ✓
```

If you see that block, the entire flow works.

### Cached token vs cold run

The script writes tokens to `~/.hq/cognito-tokens.json` (mode `0600`) on
success. Subsequent runs skip the browser entirely as long as the cached
token isn't within 120s of expiry. Refresh-grant kicks in transparently
when the access token is stale but the refresh token is still valid.

To force a cold run (e.g., to verify the OAuth path itself):

```bash
rm ~/.hq/cognito-tokens.json
npx tsx scripts/e2e-create-company-smoke.ts
```

A cold run will open a browser to the Cognito Hosted UI and wait up to
15 minutes for sign-in.

### Troubleshooting

**`ERR_MODULE_NOT_FOUND` for the script path.** You're not in the repo
root. `cd ~/hq/companies/indigo/repos/hq` first; `npx tsx` resolves
relative to cwd.

**`Login timed out after 15 minutes`.** You didn't complete the Cognito
sign-in in time. The 15-minute ceiling is generous on purpose; if you
just need to re-trigger, delete `~/.hq/cognito-tokens.json` and re-run.

**`Address already in use :8765`.** Some other process owns the loopback
port. Either kill it, or pick another port:
`COGNITO_CALLBACK_PORT=53682 npx tsx scripts/e2e-create-company-smoke.ts`.
The Cognito client allows `3000`, `8765`, and `53682`.

**Script appears to hang after `END-TO-END DEMO PASSED`.** Shouldn't
happen — `cognito-auth.ts` `cleanup()` clears the 15-min login timer
on every exit path. If it does happen, that's a regression: file an
issue and check whether someone reintroduced a `setTimeout` that lacks
a clearTimeout in the resolve branch.

**`STS credentials expired during sync`.** STS sessions are 900s minimum
(see memory: `project_aws_sts_900s_floor.md`). The script calls
`refreshEntityContext` before the simulated remote edit specifically
to avoid this. If you're hitting it, your run is taking >15 min in
Phase 1 — probably AWS bucket provisioning is slow. Re-run.

### What it does NOT clean up

The script does NOT tear down the company it creates. Each run leaves:

- A new `prs_*` person entity in the vault User Pool
- A new `cmp_*` company entity
- A new `hq-vault-cmp-*` bucket + KMS key
- A row in the memberships table
- A local `~/hq-demo-flow/companies/{slug}/` tree

This is intentional — it lets you `aws s3 ls` the bucket and poke at
the resources after a run. To clean up, use `vlt-e2e-full-lifecycle.ts`
(which has a teardown phase) or delete via the AWS console.

> **Known follow-up:** every run currently provisions a fresh company
> rather than reusing an existing one with the same slug. The
> idempotency path in `createCompanyFlow` (`VaultConflictError`) isn't
> firing on slug match. Tracked separately.

---

## Related

- **Onboarding library:** `packages/hq-onboarding/src/orchestrator.ts`
- **Cognito helper:** `packages/hq-cloud/src/cognito-auth.ts`
- **share() / sync() CLI:** `packages/hq-cloud/src/cli/{share,sync}.ts`
- **Project PRD:** `companies/indigo/projects/hq-vault-unification/vlt-9-onboarding/README.md`
- **Vault stack infra:** `repos/private/hq-pro/infra/`
