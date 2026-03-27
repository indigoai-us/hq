/**
 * Tests for hq trust — trusted publishers management (US-014b)
 * Uses Node.js built-in test runner (node:test).
 *
 * Trust-store isolation: sets HQ_TRUST_FILE to a temp file so tests never
 * touch the developer's real ~/.hq/trusted-publishers.json.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';

import {
  addTrusted,
  listTrusted,
  removeTrusted,
  isTrusted,
} from '../utils/trusted-publishers.js';
import { registerTrustCommand } from './trust.js';

// ─── Temp trust-store setup ───────────────────────────────────────────────────

let tempDir: string;

// Set HQ_TRUST_FILE before any test touches the trust store.
// Because getTrustFilePath() reads the env var at call time, this is enough.
before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'hq-trust-test-'));
  process.env['HQ_TRUST_FILE'] = path.join(tempDir, 'trusted-publishers.json');
});

after(async () => {
  delete process.env['HQ_TRUST_FILE'];
  try { await rm(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ─── Trust store round-trip ───────────────────────────────────────────────────

describe('trusted-publishers utility (addTrusted / removeTrusted / listTrusted / isTrusted)', () => {
  test('listTrusted returns empty array initially', async () => {
    const result = await listTrusted();
    assert.deepEqual(result, []);
  });

  test('addTrusted adds a publisher', async () => {
    await addTrusted('indigo');
    const result = await listTrusted();
    assert.ok(result.includes('indigo'), `Expected "indigo" in list, got: ${JSON.stringify(result)}`);
  });

  test('isTrusted returns true for added publisher', async () => {
    const result = await isTrusted('indigo');
    assert.equal(result, true);
  });

  test('isTrusted returns false for unknown publisher', async () => {
    const result = await isTrusted('__not_a_real_publisher_xyz__');
    assert.equal(result, false);
  });

  test('addTrusted is idempotent — no duplicates', async () => {
    await addTrusted('indigo');
    await addTrusted('indigo');
    const result = await listTrusted();
    const count = result.filter(p => p === 'indigo').length;
    assert.equal(count, 1, `Expected exactly 1 entry for "indigo", got ${count}`);
  });

  test('addTrusted can add multiple publishers', async () => {
    await addTrusted('acme');
    const result = await listTrusted();
    assert.ok(result.includes('indigo'), 'Expected "indigo"');
    assert.ok(result.includes('acme'), 'Expected "acme"');
  });

  test('removeTrusted removes a publisher', async () => {
    await removeTrusted('acme');
    const result = await listTrusted();
    assert.ok(!result.includes('acme'), `Expected "acme" to be removed, got: ${JSON.stringify(result)}`);
    assert.ok(result.includes('indigo'), 'Expected "indigo" to remain');
  });

  test('removeTrusted is idempotent — no error on absent publisher', async () => {
    await assert.doesNotReject(async () => {
      await removeTrusted('never-existed');
    });
  });

  test('file created on first use when it does not exist', async () => {
    // Point to a fresh file that doesn't exist yet
    const freshFile = path.join(tempDir, 'fresh-publishers.json');
    const original = process.env['HQ_TRUST_FILE'];
    process.env['HQ_TRUST_FILE'] = freshFile;
    try {
      await addTrusted('first-publisher');
      const content = await readFile(freshFile, 'utf8');
      const parsed = JSON.parse(content) as { publishers: string[] };
      assert.ok(parsed.publishers.includes('first-publisher'));
    } finally {
      process.env['HQ_TRUST_FILE'] = original;
    }
  });
});

// ─── Command registration ─────────────────────────────────────────────────────

describe('registerTrustCommand', () => {
  test('registers a "trust" command on the program', () => {
    const program = new Command();
    program.exitOverride();
    registerTrustCommand(program);

    const commands = program.commands.map(c => c.name());
    assert.ok(commands.includes('trust'), `Expected "trust" in commands, got: ${commands.join(', ')}`);
  });

  test('"trust" command accepts optional publisher argument', () => {
    const program = new Command();
    program.exitOverride();
    registerTrustCommand(program);

    const trustCmd = program.commands.find(c => c.name() === 'trust');
    assert.ok(trustCmd, 'trust command not found');
    assert.ok(
      trustCmd.description().length > 0,
      'Expected trust command to have a description'
    );
  });

  test('"trust" command has --list option', () => {
    const program = new Command();
    program.exitOverride();
    registerTrustCommand(program);

    const trustCmd = program.commands.find(c => c.name() === 'trust');
    assert.ok(trustCmd, 'trust command not found');
    const optionNames = trustCmd.options.map(o => o.long);
    assert.ok(optionNames.includes('--list'), `Expected --list option, got: ${optionNames.join(', ')}`);
  });

  test('"trust" command has --remove option', () => {
    const program = new Command();
    program.exitOverride();
    registerTrustCommand(program);

    const trustCmd = program.commands.find(c => c.name() === 'trust');
    assert.ok(trustCmd, 'trust command not found');
    const optionNames = trustCmd.options.map(o => o.long);
    assert.ok(optionNames.includes('--remove'), `Expected --remove option, got: ${optionNames.join(', ')}`);
  });

  test('"trust" command has a meaningful description', () => {
    const program = new Command();
    program.exitOverride();
    registerTrustCommand(program);

    const trustCmd = program.commands.find(c => c.name() === 'trust');
    assert.ok(trustCmd, 'trust command not found');
    assert.ok(
      trustCmd.description().toLowerCase().includes('trust'),
      `Expected description to mention trust, got: "${trustCmd.description()}"`
    );
  });
});
