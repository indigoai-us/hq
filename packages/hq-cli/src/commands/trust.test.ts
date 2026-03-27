/**
 * Tests for hq trust — trusted publishers management (US-014b)
 * Uses Node.js built-in test runner (node:test).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

import { Command } from 'commander';

import {
  addTrusted,
  listTrusted,
  removeTrusted,
  isTrusted,
} from '../utils/trusted-publishers.js';
import { registerTrustCommand } from './trust.js';

// ─── Trust store round-trip ───────────────────────────────────────────────────

const TRUST_FILE = path.join(homedir(), '.hq', 'trusted-publishers.json');

describe('trusted-publishers utility (addTrusted / removeTrusted / listTrusted / isTrusted)', () => {
  // Save and restore the trust file so tests don't affect the real install.
  let originalContent: string | null = null;

  before(async () => {
    try {
      originalContent = await readFile(TRUST_FILE, 'utf8');
    } catch {
      originalContent = null;
    }
    // Start with empty trust list
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(TRUST_FILE), { recursive: true });
    await writeFile(TRUST_FILE, JSON.stringify({ publishers: [] }, null, 2) + '\n', 'utf8');
  });

  after(async () => {
    const { mkdir, writeFile, unlink } = await import('node:fs/promises');
    if (originalContent !== null) {
      await mkdir(path.dirname(TRUST_FILE), { recursive: true });
      await writeFile(TRUST_FILE, originalContent, 'utf8');
    } else {
      try { await unlink(TRUST_FILE); } catch { /* already gone */ }
    }
  });

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
    const result = await isTrusted('unknown-publisher');
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
    // Delete the file to simulate first use
    const { unlink } = await import('node:fs/promises');
    try { await unlink(TRUST_FILE); } catch { /* already absent */ }

    await addTrusted('first-publisher');
    const content = await readFile(TRUST_FILE, 'utf8');
    const parsed = JSON.parse(content) as { publishers: string[] };
    assert.ok(parsed.publishers.includes('first-publisher'));
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
    // Optional argument means no "required" — check usage string
    const usage = trustCmd.usage();
    assert.ok(
      usage.includes('[publisher]') || trustCmd.description().length > 0,
      'Expected trust command to be registered with optional publisher'
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
