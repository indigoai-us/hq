/**
 * Unit tests for the sync journal (ADR-0001 Phase 5).
 *
 * Verifies per-company isolation, HQ_STATE_DIR override, and filename
 * sanitization — all behaviors that the pre-Phase-5 monolithic journal
 * didn't need.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getJournalPath,
  getStateDir,
  readJournal,
  writeJournal,
  updateEntry,
} from "./journal.js";
import type { SyncJournal } from "./types.js";

describe("journal", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-journal-test-"));
    process.env.HQ_STATE_DIR = stateDir;
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
    delete process.env.HQ_STATE_DIR;
  });

  describe("getStateDir", () => {
    it("honors HQ_STATE_DIR env var", () => {
      expect(getStateDir()).toBe(stateDir);
    });

    it("falls back to ~/.hq when env var unset", () => {
      delete process.env.HQ_STATE_DIR;
      expect(getStateDir()).toBe(path.join(os.homedir(), ".hq"));
    });
  });

  describe("getJournalPath", () => {
    it("produces a per-slug filename", () => {
      expect(getJournalPath("indigo")).toBe(
        path.join(stateDir, "sync-journal.indigo.json"),
      );
    });

    it("isolates different slugs into different files", () => {
      expect(getJournalPath("indigo")).not.toBe(getJournalPath("brandstage"));
    });

    it("sanitizes path-unsafe characters", () => {
      expect(getJournalPath("foo/bar")).toBe(
        path.join(stateDir, "sync-journal.foo_bar.json"),
      );
      expect(getJournalPath("../escape")).toBe(
        path.join(stateDir, "sync-journal.___escape.json"),
      );
    });

    it("throws on empty slug", () => {
      expect(() => getJournalPath("")).toThrow(/slug is required/);
    });

    it("throws on slug that sanitizes to empty", () => {
      expect(() => getJournalPath("///")).toThrow(/empty identifier/);
    });
  });

  describe("readJournal", () => {
    it("returns an empty journal when the file doesn't exist", () => {
      const j = readJournal("indigo");
      expect(j.version).toBe("1");
      expect(j.files).toEqual({});
      expect(j.lastSync).toBe("");
    });

    it("reads a journal written with writeJournal", () => {
      const original: SyncJournal = {
        version: "1",
        lastSync: "2026-04-19T00:00:00.000Z",
        files: {
          "docs/handoff.md": {
            hash: "abc123",
            size: 42,
            syncedAt: "2026-04-19T00:00:00.000Z",
            direction: "down",
          },
        },
      };
      writeJournal("indigo", original);
      const roundTripped = readJournal("indigo");
      expect(roundTripped).toEqual(original);
    });
  });

  describe("writeJournal", () => {
    it("creates the state directory if it doesn't exist", () => {
      const nestedDir = path.join(stateDir, "nested", "deep");
      process.env.HQ_STATE_DIR = nestedDir;
      expect(fs.existsSync(nestedDir)).toBe(false);

      writeJournal("indigo", { version: "1", lastSync: "", files: {} });
      expect(fs.existsSync(nestedDir)).toBe(true);
      expect(
        fs.existsSync(path.join(nestedDir, "sync-journal.indigo.json")),
      ).toBe(true);
    });

    it("keeps per-company journals independent", () => {
      writeJournal("indigo", {
        version: "1",
        lastSync: "",
        files: { "a.md": { hash: "1", size: 1, syncedAt: "", direction: "up" } },
      });
      writeJournal("brandstage", {
        version: "1",
        lastSync: "",
        files: { "b.md": { hash: "2", size: 2, syncedAt: "", direction: "up" } },
      });

      const indigo = readJournal("indigo");
      const brandstage = readJournal("brandstage");
      expect(indigo.files).toHaveProperty("a.md");
      expect(indigo.files).not.toHaveProperty("b.md");
      expect(brandstage.files).toHaveProperty("b.md");
      expect(brandstage.files).not.toHaveProperty("a.md");
    });
  });

  describe("updateEntry", () => {
    it("stamps lastSync and the per-file syncedAt", () => {
      const j: SyncJournal = { version: "1", lastSync: "", files: {} };
      updateEntry(j, "foo.md", "hash", 10, "up");
      expect(j.files["foo.md"]?.hash).toBe("hash");
      expect(j.files["foo.md"]?.direction).toBe("up");
      expect(j.lastSync).not.toBe("");
      expect(j.files["foo.md"]?.syncedAt).not.toBe("");
    });
  });
});
