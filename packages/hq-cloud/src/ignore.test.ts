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
