# Changelog

## [5.9.0] — 2026-05-04

### Added

- **`hq run` command** — schema-driven dev workflow. Place a `.env.schema` file in
  your repo (annotated with `# @hqCompany("your-slug")` and `VARNAME=hq()` resolvers),
  then run `hq run -- npm run dev` to inject all declared secrets into the child
  process's environment without ever printing them to stdout/stderr. Discovers schemas
  by walking up from cwd to the repo root; merges multiple schemas; respects sibling
  `.env.local` files for local overrides. Supports `--check` for a dry-run summary,
  `--company` to override the slug, and `--schema` to pin an explicit schema path.

- **Batch secrets endpoint** — `POST /secrets/{companyUid}/load` on the vault API
  reduces N parallel single-secret fetches to chunked `ssm:GetParameters` calls
  (up to 10 names per batch), cutting `hq run` latency for schemas with many vars.
  Responses include both `secrets` (allowed) and `errors` (denied/not-found) per name.
  Each revealed secret is audit-logged individually (same trail as `hq secrets get`).

- **`varlock` dependency** (`1.0.0`, exact pin) — used as an internal library to
  parse `.env.schema` files and drive the resolver graph. The `hq()` resolver is
  implemented as a varlock plugin registered at runtime; varlock is not exposed as a
  public API surface.

- **`hq cloud demote company <slug>` subcommand** — inverse of
  `hq cloud provision company`. Converts a cloud-backed company back to local-only
  after its entity has been soft-tombstoned in hq-console (Settings → Delete company).
  Removes `companies/<slug>/.hq/config.json`, flips `cloud: true → false` in
  `companies/<slug>/company.yaml`, and strips `cloud_uid` + `bucket_name` from
  `companies/manifest.yaml`. Default safety check verifies the cloud entity is
  `deleted=true`; `--force` skips the check (used by AppBar HQ Sync's Path A after
  it has already verified). All side-effects atomic + idempotent. Exit codes mirror
  `cloud provision` (0 ok, 1 vault HTTP, 2 validation).

### Changed

- **Node minimum raised to `>=22.0.0`** — required by `varlock@1.0.0` (ESM-only,
  `node>=22`). The previous minimum was unset; this makes the requirement explicit
  in `engines.node`.
