/**
 * Unit tests for createIgnoreFilter.
 *
 * Covers both modes: legacy permissive (no .hqinclude) and allowlist mode
 * (.hqinclude present). The allowlist tests guard against accidentally
 * leaking sensitive subtrees like data/ or workers/ to S3 — a regression
 * here would silently push private content on the next sync.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createIgnoreFilter } from "./ignore.js";

describe("createIgnoreFilter", () => {
  let hqRoot: string;

  beforeEach(() => {
    hqRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hq-ignore-test-"));
  });

  afterEach(() => {
    fs.rmSync(hqRoot, { recursive: true, force: true });
  });

  it("permissive mode: regular files sync, defaults are ignored", () => {
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/notes.md"))).toBe(true);
    expect(shouldSync(path.join(hqRoot, "node_modules/foo/x.js"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, ".env"))).toBe(false);
  });

  it("permissive mode: .hqignore patterns are honored", () => {
    fs.writeFileSync(path.join(hqRoot, ".hqignore"), "companies/*/data/\n");
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/data/x.csv"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/notes.md"))).toBe(true);
  });

  it("permissive mode: HQ-root core.yaml marker is ignored", () => {
    // core.yaml is the local hq-root identity marker. It must never
    // round-trip through the bucket — pulling another machine's marker
    // would corrupt root discovery.
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(shouldSync(path.join(hqRoot, "core.yaml"))).toBe(false);
  });

  it("permissive mode: modules/modules.yaml manifest is ignored", () => {
    // modules.yaml is the local modules-resolution manifest. Per-machine
    // state, never synced.
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(shouldSync(path.join(hqRoot, "modules/modules.yaml"))).toBe(false);
  });

  it("permissive mode: per-company company.yaml is ignored", () => {
    // company.yaml is written locally on first sync from the entity context.
    // Round-tripping it would let one machine's identity overwrite another's.
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/company.yaml"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "company.yaml"))).toBe(false);
  });

  it("permissive mode: INDEX.md and policies/_digest.md are ignored", () => {
    // Both are auto-generated locally — INDEX.md by the tools indexer and
    // policies/_digest.md by the policies digest builder.
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(shouldSync(path.join(hqRoot, "INDEX.md"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/ghq/tools/INDEX.md"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "policies/_digest.md"))).toBe(false);
  });

  it("permissive mode: .claude/worktrees/ is ignored", () => {
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(shouldSync(path.join(hqRoot, ".claude/worktrees/foo/file.ts"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/.claude/worktrees/bar/x.md"))).toBe(false);
    // The .claude/ dir itself (settings, commands, skills) still syncs.
    expect(shouldSync(path.join(hqRoot, ".claude/settings.json"))).toBe(true);
  });

  it("permissive mode: .hq-* internal state is ignored, .hqignore family + .hq/ still sync", () => {
    const shouldSync = createIgnoreFilter(hqRoot);
    // Internal state files that must never round-trip through the bucket.
    expect(shouldSync(path.join(hqRoot, ".hq-sync.pid"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, ".hq-sync-journal.json"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, ".hq-sync-state.json"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, ".hq-embeddings-pending.json"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/.hq-foo.json"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, ".hq-cache/blob.bin"))).toBe(false);
    // Sync-config files and the .hq/ directory still sync.
    expect(shouldSync(path.join(hqRoot, ".hqignore"))).toBe(true);
    expect(shouldSync(path.join(hqRoot, ".hqsyncignore"))).toBe(true);
    expect(shouldSync(path.join(hqRoot, ".hqinclude"))).toBe(true);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/.hq/config.json"))).toBe(true);
  });

  it("allowlist mode: presence of .hqinclude switches to opt-in", () => {
    fs.writeFileSync(
      path.join(hqRoot, ".hqinclude"),
      "companies/*/knowledge/\ncompanies/*/projects/\n",
    );
    const shouldSync = createIgnoreFilter(hqRoot);
    // Allowlisted paths sync.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/knowledge/foo.md"))).toBe(true);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/projects/p1/prd.json"))).toBe(true);
    // Anything else stays local — this is the privacy guarantee.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/data/leads.csv"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/workers/cmo/skill.md"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/settings/aws.json"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "personal/journal/2026-04-26.md"))).toBe(false);
  });

  it("allowlist mode: directory entries match dir-suffix include patterns (walker descent)", () => {
    // Regression: walkDir tests directory entries when deciding whether to
    // descend. The `ignore` lib only matches dir-only patterns like
    // `companies/*/knowledge/` against paths that end with `/`. The filter
    // accepts an `isDir` hint and appends the trailing slash before probing,
    // mirroring how git itself decides (it knows from the index whether
    // each entry is a tree or a blob). Without the hint the walker would
    // see `companies/indigo/knowledge` -> not allowed -> never descend ->
    // entire subtree silently lost. Files inside still work because
    // `ignore` walks ancestors internally; the bug only bites the descent
    // decision for directory entries.
    fs.writeFileSync(
      path.join(hqRoot, ".hqinclude"),
      "companies/*/knowledge/\ncompanies/*/projects/\n.claude/\n",
    );
    const shouldSync = createIgnoreFilter(hqRoot);
    // Directory entries must be allowed when the caller hints isDir=true.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/knowledge"), true)).toBe(true);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/projects"), true)).toBe(true);
    expect(shouldSync(path.join(hqRoot, ".claude"), true)).toBe(true);
    // Files inside still resolve correctly without the hint.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/knowledge/x.md"))).toBe(true);
    expect(shouldSync(path.join(hqRoot, ".claude/settings.json"))).toBe(true);
    // Non-allowlisted siblings stay excluded — privacy guarantee intact.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/data"), true)).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/workers"), true)).toBe(false);
  });

  it("allowlist mode: walker descends through intermediate ancestor dirs", () => {
    // Full gitignore semantics: a walker starting at hqRoot must be able to
    // descend through `companies/` and `companies/indigo/` to reach the
    // allowlisted leaf `companies/*/knowledge/`. The ancestor matcher
    // permits this for dir-mode queries while keeping files directly inside
    // those intermediate dirs excluded — privacy invariant intact.
    fs.writeFileSync(
      path.join(hqRoot, ".hqinclude"),
      "companies/*/knowledge/\n",
    );
    const shouldSync = createIgnoreFilter(hqRoot);
    // Intermediate directories along the path to the leaf are descent-allowed.
    expect(shouldSync(path.join(hqRoot, "companies"), true)).toBe(true);
    expect(shouldSync(path.join(hqRoot, "companies/indigo"), true)).toBe(true);
    // The leaf itself is allowed.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/knowledge"), true)).toBe(true);
    // Files directly inside intermediate dirs are still excluded — only the
    // dir is descent-allowed, the dir's loose files are not.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/notes.md"))).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/README.md"))).toBe(false);
    // Files inside the allowlisted leaf still sync.
    expect(shouldSync(path.join(hqRoot, "companies/indigo/knowledge/x.md"))).toBe(true);
  });

  it("dir-only ignore patterns honor the isDir hint symmetrically", () => {
    // Gitignore semantics: a trailing-slash pattern (`foo/`) matches only
    // directories, never files of the same name. The filter applies this
    // on BOTH layers — exclude and include — by appending `/` to the probe
    // when the caller passes isDir=true, and leaving it as-is otherwise.
    // This guarantees:
    //   - a directory `node_modules` is excluded (descent skipped),
    //   - but a regular file literally named `node_modules` is NOT
    //     mistakenly excluded by the dir-only pattern.
    fs.writeFileSync(path.join(hqRoot, ".hqignore"), "build/\n");
    const shouldSync = createIgnoreFilter(hqRoot);
    // Directory `build` matches the dir-only exclusion.
    expect(shouldSync(path.join(hqRoot, "build"), true)).toBe(false);
    // A file literally named `build` (not a dir) does NOT match `build/`.
    // This is the asymmetry that previous PR comments warned about and
    // that the isDir hint resolves cleanly.
    expect(shouldSync(path.join(hqRoot, "build"), false)).toBe(true);
    // Default-call (no hint) is treated as "not a directory" — matches
    // gitignore's blob-default and preserves the file-side guarantee.
    expect(shouldSync(path.join(hqRoot, "build"))).toBe(true);
  });

  it("allowlist mode: exclusion layers still subtract on top", () => {
    // Even when a subtree is allowlisted, default ignores like node_modules/
    // and .env must still apply. Otherwise an allowlisted subdir would sync
    // gigabytes of dependency junk or leak secret env files.
    fs.writeFileSync(path.join(hqRoot, ".hqinclude"), "companies/*/projects/\n");
    const shouldSync = createIgnoreFilter(hqRoot);
    expect(
      shouldSync(path.join(hqRoot, "companies/indigo/projects/p1/prd.json")),
    ).toBe(true);
    expect(
      shouldSync(path.join(hqRoot, "companies/indigo/projects/p1/node_modules/react/index.js")),
    ).toBe(false);
    expect(shouldSync(path.join(hqRoot, "companies/indigo/projects/p1/.env"))).toBe(false);
  });
});
