import { describe, it, expect, vi } from 'vitest';

// Mock config with a valid 64-char hex key (32 bytes)
vi.mock('../config.js', () => ({
  config: {
    tokenEncryptionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
}));

import { encryptToken, decryptToken } from '../data/token-encryption.js';

describe('Token Encryption', () => {
  it('should round-trip encrypt and decrypt a token', () => {
    const token = 'sk-ant-oauthtoken-abc123-test-value';
    const encrypted = encryptToken(token);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it('should produce different ciphertexts for the same input (random IV)', () => {
    const token = 'same-token-value';
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(a).not.toBe(b);
  });

  it('should decrypt back to the same value regardless of IV', () => {
    const token = 'another-test-token';
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(decryptToken(a)).toBe(token);
    expect(decryptToken(b)).toBe(token);
  });

  it('should handle long tokens', () => {
    const token = 'x'.repeat(2000);
    const encrypted = encryptToken(token);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it('should throw on tampered ciphertext', () => {
    const token = 'test-token';
    const encrypted = encryptToken(token);
    const buf = Buffer.from(encrypted, 'base64');
    // Flip a byte in the ciphertext area
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('should throw on too-short input', () => {
    const tooShort = Buffer.alloc(10).toString('base64');
    expect(() => decryptToken(tooShort)).toThrow('too short');
  });

  it('should throw on invalid packed data', () => {
    // Empty buffer after base64 decode is too short
    expect(() => decryptToken('')).toThrow();
  });
});
