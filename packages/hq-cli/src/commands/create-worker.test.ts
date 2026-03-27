/**
 * Tests for hq create-worker — scaffolding + command registration (US-015)
 * Uses Node.js built-in test runner (node:test).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import yaml from 'js-yaml';

import {
  scaffoldWorkerPackage,
  registerCreateWorkerCommand,
  validateName,
  VALID_PACKAGE_TYPES,
} from './create-worker.js';
import { validateManifest } from './publish.js';

// ─── validateName ─────────────────────────────────────────────────────────────

describe('validateName', () => {
  test('passes for a simple lowercase name', () => {
    assert.equal(validateName('my-worker'), null);
  });

  test('passes for a single character name', () => {
    assert.equal(validateName('a'), null);
  });

  test('passes for digits in name', () => {
    assert.equal(validateName('worker1'), null);
  });

  test('passes for name starting with digit', () => {
    assert.equal(validateName('1worker'), null);
  });

  test('fails for empty name', () => {
    assert.ok(validateName('') !== null);
  });

  test('fails for name with uppercase', () => {
    assert.ok(validateName('MyWorker') !== null);
  });

  test('fails for name with trailing hyphen', () => {
    assert.ok(validateName('my-worker-') !== null);
  });

  test('fails for name with leading hyphen', () => {
    assert.ok(validateName('-my-worker') !== null);
  });

  test('fails for name with consecutive hyphens', () => {
    assert.ok(validateName('my--worker') !== null);
  });

  test('fails for name with spaces', () => {
    assert.ok(validateName('my worker') !== null);
  });
});

// ─── scaffoldWorkerPackage ────────────────────────────────────────────────────

describe('scaffoldWorkerPackage', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-create-worker-test-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('creates expected files for a worker-pack', async () => {
    const created = await scaffoldWorkerPackage({
      name: 'test-worker',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    // Returns list of relative paths
    assert.ok(Array.isArray(created), 'Expected an array of created paths');
    assert.ok(created.length > 0, 'Expected at least one created path');

    // Check expected paths are included
    const expected = [
      'test-worker/hq-package.yaml',
      'test-worker/workers/test-worker/worker.yaml',
      'test-worker/skills/.gitkeep',
      'test-worker/knowledge/.gitkeep',
      'test-worker/hooks/on-install.sh',
    ];

    for (const expectedPath of expected) {
      assert.ok(
        created.includes(expectedPath),
        `Expected "${expectedPath}" in created files, got: ${created.join(', ')}`
      );
    }
  });

  test('hq-package.yaml exists and is valid YAML', async () => {
    await scaffoldWorkerPackage({
      name: 'yaml-check-worker',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    const manifestPath = path.join(tmpDir, 'yaml-check-worker', 'hq-package.yaml');
    const content = await readFile(manifestPath, 'utf8');
    const parsed = yaml.load(content);

    assert.ok(parsed !== null && typeof parsed === 'object', 'Expected parsed YAML to be an object');
  });

  test('generated hq-package.yaml passes validateManifest', async () => {
    await scaffoldWorkerPackage({
      name: 'validated-worker',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    const manifestPath = path.join(tmpDir, 'validated-worker', 'hq-package.yaml');
    const content = await readFile(manifestPath, 'utf8');
    const parsed = yaml.load(content);
    const errors = validateManifest(parsed);

    assert.deepEqual(
      errors,
      [],
      `Expected no validation errors, got: ${errors.join(', ')}`
    );
  });

  test('hq-package.yaml has correct name and type fields', async () => {
    await scaffoldWorkerPackage({
      name: 'field-check-worker',
      type: 'skill-bundle',
      outDir: tmpDir,
    });

    const manifestPath = path.join(tmpDir, 'field-check-worker', 'hq-package.yaml');
    const content = await readFile(manifestPath, 'utf8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    assert.equal(parsed['name'], 'field-check-worker');
    assert.equal(parsed['type'], 'skill-bundle');
    assert.equal(parsed['version'], '0.1.0');
  });

  test('workers/{name}/worker.yaml exists and is valid YAML', async () => {
    await scaffoldWorkerPackage({
      name: 'worker-yaml-check',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    const workerPath = path.join(tmpDir, 'worker-yaml-check', 'workers', 'worker-yaml-check', 'worker.yaml');
    const content = await readFile(workerPath, 'utf8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    assert.equal(parsed['name'], 'worker-yaml-check');
    assert.equal(parsed['version'], '0.1.0');
    assert.ok(Array.isArray(parsed['skills']), 'Expected skills to be an array');
    assert.ok(Array.isArray(parsed['knowledge']), 'Expected knowledge to be an array');
  });

  test('skills/.gitkeep exists', async () => {
    await scaffoldWorkerPackage({
      name: 'gitkeep-check',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    const gitkeepPath = path.join(tmpDir, 'gitkeep-check', 'skills', '.gitkeep');
    const s = await stat(gitkeepPath);
    assert.ok(s.isFile(), 'Expected skills/.gitkeep to be a file');
  });

  test('knowledge/.gitkeep exists', async () => {
    await scaffoldWorkerPackage({
      name: 'knowledge-gitkeep-check',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    const gitkeepPath = path.join(tmpDir, 'knowledge-gitkeep-check', 'knowledge', '.gitkeep');
    const s = await stat(gitkeepPath);
    assert.ok(s.isFile(), 'Expected knowledge/.gitkeep to be a file');
  });

  test('hooks/on-install.sh exists and is executable', async () => {
    await scaffoldWorkerPackage({
      name: 'hook-exec-check',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    const hookPath = path.join(tmpDir, 'hook-exec-check', 'hooks', 'on-install.sh');
    const s = await stat(hookPath);

    assert.ok(s.isFile(), 'Expected hooks/on-install.sh to be a file');
    // Check executable bit (owner execute = 0o100)
    // eslint-disable-next-line no-bitwise
    assert.ok((s.mode & 0o100) !== 0, 'Expected hooks/on-install.sh to be executable');
  });

  test('hooks/on-install.sh has a shebang line', async () => {
    await scaffoldWorkerPackage({
      name: 'shebang-check',
      type: 'worker-pack',
      outDir: tmpDir,
    });

    const hookPath = path.join(tmpDir, 'shebang-check', 'hooks', 'on-install.sh');
    const content = await readFile(hookPath, 'utf8');
    assert.ok(content.startsWith('#!/usr/bin/env bash'), 'Expected shebang line at start of on-install.sh');
  });

  test('works with all valid package types', async () => {
    for (const type of VALID_PACKAGE_TYPES) {
      const name = `type-check-${type}`;
      await scaffoldWorkerPackage({ name, type, outDir: tmpDir });

      const manifestPath = path.join(tmpDir, name, 'hq-package.yaml');
      const content = await readFile(manifestPath, 'utf8');
      const parsed = yaml.load(content);
      const errors = validateManifest(parsed);

      assert.deepEqual(
        errors,
        [],
        `Expected no validation errors for type "${type}", got: ${errors.join(', ')}`
      );
    }
  });
});

// ─── Command registration ─────────────────────────────────────────────────────

describe('registerCreateWorkerCommand', () => {
  test('registers a "create-worker" command on the program', () => {
    const program = new Command();
    program.exitOverride();
    registerCreateWorkerCommand(program);

    const commands = program.commands.map(c => c.name());
    assert.ok(
      commands.includes('create-worker'),
      `Expected "create-worker" in commands, got: ${commands.join(', ')}`
    );
  });

  test('"create-worker" command has --out-dir option', () => {
    const program = new Command();
    program.exitOverride();
    registerCreateWorkerCommand(program);

    const cmd = program.commands.find(c => c.name() === 'create-worker');
    assert.ok(cmd, 'create-worker command not found');

    const optionNames = cmd.options.map(o => o.long);
    assert.ok(
      optionNames.includes('--out-dir'),
      `Expected --out-dir option, got: ${optionNames.join(', ')}`
    );
  });

  test('"create-worker" command accepts optional [name] argument', () => {
    const program = new Command();
    program.exitOverride();
    registerCreateWorkerCommand(program);

    const cmd = program.commands.find(c => c.name() === 'create-worker');
    assert.ok(cmd, 'create-worker command not found');

    // Commander stores args — check usage string mentions name
    const usage = cmd.usage();
    assert.ok(
      usage.includes('[name]') || cmd.registeredArguments.some(a => a.name() === 'name'),
      `Expected [name] argument, usage: "${usage}"`
    );
  });
});
