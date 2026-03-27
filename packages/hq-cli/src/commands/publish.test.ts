/**
 * Tests for hq publish — manifest validation + command registration (US-014)
 * Uses Node.js built-in test runner (node:test).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Command } from 'commander';

import { validateManifest } from './publish.js';
import { registerPublishCommand } from './publish.js';

// ─── validateManifest ─────────────────────────────────────────────────────────

describe('validateManifest', () => {
  // ── Valid manifests ────────────────────────────────────────────────────────

  test('passes for a complete valid manifest', () => {
    const pkg = {
      name: 'my-worker-pack',
      type: 'worker-pack',
      version: '1.0.0',
      description: 'A test worker pack',
    };
    const errors = validateManifest(pkg);
    assert.deepEqual(errors, []);
  });

  test('passes for all valid type values', () => {
    const types = [
      'worker-pack',
      'command-set',
      'skill-bundle',
      'knowledge-base',
      'company-template',
    ];
    for (const type of types) {
      const pkg = { name: 'pkg', type, version: '1.0.0', description: 'desc' };
      const errors = validateManifest(pkg);
      assert.deepEqual(
        errors,
        [],
        `Expected no errors for type "${type}", got: ${errors.join(', ')}`
      );
    }
  });

  test('passes when optional fields are present', () => {
    const pkg = {
      name: 'full-package',
      type: 'skill-bundle',
      version: '2.3.1',
      description: 'Comprehensive package',
      author: 'Test Author',
      repo: 'https://github.com/example/pkg',
      minHQVersion: '5.0.0',
      requires: { packages: ['dep-pack'], services: ['github'] },
      exposes: {
        workers: ['workers/my-worker.yaml'],
        commands: ['.claude/commands/my-cmd.md'],
        skills: ['.claude/skills/my-skill.md'],
        knowledge: ['knowledge/my-kb/'],
      },
      hooks: {
        'on-install': 'scripts/install.sh',
        'on-update': 'scripts/update.sh',
        'on-remove': 'scripts/remove.sh',
      },
    };
    const errors = validateManifest(pkg);
    assert.deepEqual(errors, []);
  });

  // ── Missing required fields ────────────────────────────────────────────────

  test('fails when name is missing', () => {
    const pkg = { type: 'worker-pack', version: '1.0.0', description: 'desc' };
    const errors = validateManifest(pkg);
    assert.ok(errors.length > 0, 'Expected errors for missing name');
    assert.ok(
      errors.some(e => e.toLowerCase().includes('name')),
      `Expected name error, got: ${errors.join(', ')}`
    );
  });

  test('fails when type is missing', () => {
    const pkg = { name: 'my-pkg', version: '1.0.0', description: 'desc' };
    const errors = validateManifest(pkg);
    assert.ok(errors.some(e => e.toLowerCase().includes('type')));
  });

  test('fails when version is missing', () => {
    const pkg = { name: 'my-pkg', type: 'worker-pack', description: 'desc' };
    const errors = validateManifest(pkg);
    assert.ok(errors.some(e => e.toLowerCase().includes('version')));
  });

  test('fails when description is missing', () => {
    const pkg = { name: 'my-pkg', type: 'worker-pack', version: '1.0.0' };
    const errors = validateManifest(pkg);
    assert.ok(errors.some(e => e.toLowerCase().includes('description')));
  });

  test('accumulates multiple errors for multiple missing fields', () => {
    const errors = validateManifest({});
    assert.ok(errors.length >= 4, `Expected at least 4 errors, got ${errors.length}: ${errors.join('; ')}`);
  });

  test('fails for completely missing manifest (null)', () => {
    const errors = validateManifest(null);
    assert.ok(errors.length > 0, 'Expected errors for null input');
  });

  test('fails for non-object manifest (string)', () => {
    const errors = validateManifest('not-an-object');
    assert.ok(errors.length > 0, 'Expected errors for string input');
  });

  // ── Invalid type ───────────────────────────────────────────────────────────

  test('fails for an invalid type value', () => {
    const pkg = {
      name: 'my-pkg',
      type: 'invalid-type',
      version: '1.0.0',
      description: 'desc',
    };
    const errors = validateManifest(pkg);
    assert.ok(errors.some(e => e.toLowerCase().includes('type')));
    assert.ok(
      errors.some(e => e.includes('invalid-type') || e.includes('Invalid')),
      `Expected error mentioning invalid type, got: ${errors.join(', ')}`
    );
  });

  test('fails for empty name string', () => {
    const pkg = { name: '', type: 'worker-pack', version: '1.0.0', description: 'desc' };
    const errors = validateManifest(pkg);
    assert.ok(errors.some(e => e.toLowerCase().includes('name')));
  });

  test('fails for empty version string', () => {
    const pkg = { name: 'pkg', type: 'worker-pack', version: '', description: 'desc' };
    const errors = validateManifest(pkg);
    assert.ok(errors.some(e => e.toLowerCase().includes('version')));
  });

  test('fails for empty description string', () => {
    const pkg = { name: 'pkg', type: 'worker-pack', version: '1.0.0', description: '' };
    const errors = validateManifest(pkg);
    assert.ok(errors.some(e => e.toLowerCase().includes('description')));
  });
});

// ─── Command registration ─────────────────────────────────────────────────────

describe('registerPublishCommand', () => {
  test('registers a "publish" command on the program', () => {
    const program = new Command();
    program.exitOverride();
    registerPublishCommand(program);

    const commands = program.commands.map(c => c.name());
    assert.ok(
      commands.includes('publish'),
      `Expected "publish" in commands, got: ${commands.join(', ')}`
    );
  });

  test('"publish" command has --dry-run option', () => {
    const program = new Command();
    program.exitOverride();
    registerPublishCommand(program);

    const publishCmd = program.commands.find(c => c.name() === 'publish');
    assert.ok(publishCmd, 'publish command not found');

    const optionNames = publishCmd.options.map(o => o.long);
    assert.ok(
      optionNames.includes('--dry-run'),
      `Expected --dry-run option, got: ${optionNames.join(', ')}`
    );
  });

  test('"publish" command has --dir option', () => {
    const program = new Command();
    program.exitOverride();
    registerPublishCommand(program);

    const publishCmd = program.commands.find(c => c.name() === 'publish');
    assert.ok(publishCmd, 'publish command not found');

    const optionNames = publishCmd.options.map(o => o.long);
    assert.ok(
      optionNames.includes('--dir'),
      `Expected --dir option, got: ${optionNames.join(', ')}`
    );
  });
});
