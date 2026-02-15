/**
 * Tests for cloud-setup commands (commands/cloud-setup.ts)
 *
 * Tests cover:
 * - Token validation logic (validateClaudeToken)
 * - Command registration (structure)
 */

import { describe, it, expect } from 'vitest';
import { validateClaudeToken } from '../commands/cloud-setup.js';
import { Command } from 'commander';
import { registerCloudSetupCommand } from '../commands/cloud-setup.js';

describe('validateClaudeToken', () => {
  it('returns error for empty string', () => {
    const result = validateClaudeToken('');
    expect(result).not.toBeNull();
    expect(result).toContain('empty');
  });

  it('returns error for whitespace-only string', () => {
    const result = validateClaudeToken('   ');
    expect(result).not.toBeNull();
    expect(result).toContain('empty');
  });

  it('returns error for token shorter than minimum length', () => {
    const result = validateClaudeToken('short');
    expect(result).not.toBeNull();
    expect(result).toContain('too short');
  });

  it('returns error for token with exactly 19 chars (below minimum)', () => {
    const result = validateClaudeToken('a'.repeat(19));
    expect(result).not.toBeNull();
    expect(result).toContain('too short');
  });

  it('returns null for token with exactly 20 chars (at minimum)', () => {
    const result = validateClaudeToken('a'.repeat(20));
    expect(result).toBeNull();
  });

  it('returns null for a long valid token', () => {
    const token = 'sk-ant-' + 'a'.repeat(100);
    const result = validateClaudeToken(token);
    expect(result).toBeNull();
  });

  it('returns error for token containing whitespace in the middle', () => {
    const result = validateClaudeToken('abc def ghi jkl mno pqr');
    expect(result).not.toBeNull();
    expect(result).toContain('whitespace');
  });

  it('returns error for token with newlines', () => {
    const result = validateClaudeToken('abcdefghijklmnopqrst\nuvwxyz');
    expect(result).not.toBeNull();
    expect(result).toContain('whitespace');
  });

  it('returns error for token with tabs', () => {
    const result = validateClaudeToken('abcdefghijklmnopqrst\tuvwxyz');
    expect(result).not.toBeNull();
    expect(result).toContain('whitespace');
  });

  it('trims leading and trailing whitespace before validation', () => {
    // 20+ chars after trimming, no internal whitespace
    const result = validateClaudeToken('  ' + 'a'.repeat(25) + '  ');
    expect(result).toBeNull();
  });

  it('returns null for a realistic OAuth token', () => {
    // Simulating a realistic token format
    const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
    const result = validateClaudeToken(token);
    expect(result).toBeNull();
  });
});

describe('registerCloudSetupCommand', () => {
  it('registers "cloud" command with "setup-token" and "status" subcommands', () => {
    const program = new Command();
    registerCloudSetupCommand(program);

    // Find the cloud command
    const cloudCmd = program.commands.find((c) => c.name() === 'cloud');
    expect(cloudCmd).toBeDefined();
    expect(cloudCmd!.description()).toBe('Cloud session management — token setup and status');

    // Check subcommands
    const subcommandNames = cloudCmd!.commands.map((c) => c.name());
    expect(subcommandNames).toContain('setup-token');
    expect(subcommandNames).toContain('status');
  });

  it('"setup-token" subcommand has correct description', () => {
    const program = new Command();
    registerCloudSetupCommand(program);

    const cloudCmd = program.commands.find((c) => c.name() === 'cloud');
    const setupTokenCmd = cloudCmd!.commands.find((c) => c.name() === 'setup-token');
    expect(setupTokenCmd).toBeDefined();
    expect(setupTokenCmd!.description()).toContain('Claude OAuth token');
  });

  it('"status" subcommand has correct description', () => {
    const program = new Command();
    registerCloudSetupCommand(program);

    const cloudCmd = program.commands.find((c) => c.name() === 'cloud');
    const statusCmd = cloudCmd!.commands.find((c) => c.name() === 'status');
    expect(statusCmd).toBeDefined();
    expect(statusCmd!.description()).toContain('status');
  });
});
