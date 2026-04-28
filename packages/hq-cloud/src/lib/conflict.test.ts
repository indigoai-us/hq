/**
 * Tests for the pure conflict primitives — path building, machine-id
 * fallback, atomic index writes, dedup. Kept in one file so the related
 * helpers stay co-located.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildConflictPath,
  buildConflictId,
  readShortMachineId,
} from "./conflict-file.js";
import {
  appendConflictEntry,
  getConflictIndexPath,
  readConflictIndex,
  removeConflictEntry,
  writeConflictIndex,
} from "./conflict-index.js";
import type { ConflictIndexEntry } from "../types.js";

describe("buildConflictPath", () => {
  it("inserts the conflict marker before the original extension", () => {
    expect(
      buildConflictPath("knowledge/notes.md", "2026-04-27T22:05:14Z", "abc123"),
    ).toBe("knowledge/notes.md.conflict-2026-04-27T22-05-14Z-abc123.md");
  });

  it("preserves nested paths and json extensions", () => {
    expect(
      buildConflictPath("projects/foo/prd.json", "2026-04-27T22:05:14.123Z", "abc123"),
    ).toBe("projects/foo/prd.json.conflict-2026-04-27T22-05-14Z-abc123.json");
  });

  it("appends the suffix verbatim for files without an extension", () => {
    expect(
      buildConflictPath("secrets", "2026-04-27T22:05:14Z", "abc123"),
    ).toBe("secrets.conflict-2026-04-27T22-05-14Z-abc123");
  });
});

describe("buildConflictId", () => {
  it("escapes path separators and dots so the id is filesystem-safe", () => {
    expect(
      buildConflictId("knowledge/notes.md", "2026-04-27T22:05:14Z"),
    ).toBe("knowledge-notes-md-2026-04-27T22-05-14Z");
  });

  it("yields the same id for the same (path, ts) pair — dedup primitive", () => {
    const a = buildConflictId("foo/bar.md", "2026-04-27T22:05:14Z");
    const b = buildConflictId("foo/bar.md", "2026-04-27T22:05:14Z");
    expect(a).toBe(b);
  });
});

describe("readShortMachineId", () => {
  let originalHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "hq-machineid-"));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    if (originalHome) process.env.HOME = originalHome;
    else delete process.env.HOME;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns the first 6 chars when menubar.json has a machineId", () => {
    fs.mkdirSync(path.join(tmpHome, ".hq"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".hq", "menubar.json"),
      JSON.stringify({ machineId: "deadbeefcafe1234567890" }),
    );
    expect(readShortMachineId()).toBe("deadbe");
  });

  it("falls back to 'unknown' when menubar.json is missing", () => {
    expect(readShortMachineId()).toBe("unknown");
  });

  it("falls back to 'unknown' when menubar.json is malformed", () => {
    fs.mkdirSync(path.join(tmpHome, ".hq"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".hq", "menubar.json"), "{not-json");
    expect(readShortMachineId()).toBe("unknown");
  });
});

describe("conflict index", () => {
  let tmpHq: string;

  beforeEach(() => {
    tmpHq = fs.mkdtempSync(path.join(os.tmpdir(), "hq-cidx-"));
  });

  afterEach(() => {
    fs.rmSync(tmpHq, { recursive: true, force: true });
  });

  function entry(overrides: Partial<ConflictIndexEntry> = {}): ConflictIndexEntry {
    return {
      id: "knowledge-notes-md-2026-04-27T22-05-14Z",
      originalPath: "knowledge/notes.md",
      conflictPath: "knowledge/notes.md.conflict-2026-04-27T22-05-14Z-abc123.md",
      detectedAt: "2026-04-27T22:05:14Z",
      side: "pull",
      machineId: "abc123",
      localHash: "local",
      remoteHash: "remote",
      remoteVersionId: "v2",
      lastKnownVersionId: "v1",
      ...overrides,
    };
  }

  it("returns an empty index when the file does not exist", () => {
    const idx = readConflictIndex(tmpHq);
    expect(idx).toEqual({ version: 1, conflicts: [] });
  });

  it("creates the .hq-conflicts dir on first write", () => {
    appendConflictEntry(tmpHq, entry());
    expect(fs.existsSync(getConflictIndexPath(tmpHq))).toBe(true);
    expect(fs.existsSync(path.join(tmpHq, ".hq-conflicts"))).toBe(true);
  });

  it("appends new entries and dedupes on id (idempotent re-detection)", () => {
    appendConflictEntry(tmpHq, entry({ id: "a", remoteVersionId: "v1" }));
    appendConflictEntry(tmpHq, entry({ id: "b", remoteVersionId: "v1" }));
    // Re-detect "a" — the second push should update in place, not duplicate.
    appendConflictEntry(tmpHq, entry({ id: "a", remoteVersionId: "v9" }));

    const idx = readConflictIndex(tmpHq);
    expect(idx.conflicts).toHaveLength(2);
    const a = idx.conflicts.find((c) => c.id === "a");
    expect(a?.remoteVersionId).toBe("v9"); // updated, not appended
  });

  it("sorts conflicts by detectedAt ascending on every write", () => {
    appendConflictEntry(tmpHq, entry({ id: "newer", detectedAt: "2026-04-27T23:00:00Z" }));
    appendConflictEntry(tmpHq, entry({ id: "older", detectedAt: "2026-04-27T22:00:00Z" }));
    const idx = readConflictIndex(tmpHq);
    expect(idx.conflicts.map((c) => c.id)).toEqual(["older", "newer"]);
  });

  it("removeConflictEntry removes a single entry by id", () => {
    appendConflictEntry(tmpHq, entry({ id: "keep" }));
    appendConflictEntry(tmpHq, entry({ id: "drop" }));
    removeConflictEntry(tmpHq, "drop");
    const idx = readConflictIndex(tmpHq);
    expect(idx.conflicts.map((c) => c.id)).toEqual(["keep"]);
  });

  it("removeConflictEntry is a no-op when the id is not present", () => {
    appendConflictEntry(tmpHq, entry({ id: "a" }));
    expect(() => removeConflictEntry(tmpHq, "missing")).not.toThrow();
    expect(readConflictIndex(tmpHq).conflicts).toHaveLength(1);
  });

  it("writeConflictIndex leaves no .tmp files on disk after success", () => {
    writeConflictIndex(tmpHq, { version: 1, conflicts: [entry()] });
    const files = fs.readdirSync(path.join(tmpHq, ".hq-conflicts"));
    // Only index.json should remain; tmp files renamed atomically into place.
    expect(files).toEqual(["index.json"]);
  });

  it("returns an empty index for malformed-but-parseable JSON", () => {
    const indexPath = getConflictIndexPath(tmpHq);
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify({ version: 1 })); // no `conflicts` array
    const idx = readConflictIndex(tmpHq);
    expect(idx.conflicts).toEqual([]);
  });
});
