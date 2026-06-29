import { describe, expect, it } from 'vitest';
import {
  adminSecretMatches,
  generateLoginCode,
  generateToken,
  hashWithSecret,
  readPositiveInteger
} from '../security';
import type { Env } from '../types';

const env = {
  ADMIN_CODE_SECRET: 'admin-secret',
  SESSION_SECRET: 'session-secret'
} as Env;

describe('worker auth security helpers', () => {
  it('checks admin secrets through a hashed comparison', async () => {
    await expect(adminSecretMatches(env, 'admin-secret')).resolves.toBe(true);
    await expect(adminSecretMatches(env, 'wrong-secret')).resolves.toBe(false);
    await expect(adminSecretMatches(env, null)).resolves.toBe(false);
  });

  it('generates numeric one-time login codes', () => {
    expect(generateLoginCode()).toMatch(/^\d{8}$/);
    expect(generateLoginCode(10)).toMatch(/^\d{10}$/);
  });

  it('hashes tokens with the configured server secret', async () => {
    const left = await hashWithSecret('token', 'secret-a');
    const right = await hashWithSecret('token', 'secret-b');

    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(left).not.toBe(right);
  });

  it('generates bearer-token friendly session tokens', () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('falls back when numeric env vars are missing or invalid', () => {
    expect(readPositiveInteger(undefined, 20)).toBe(20);
    expect(readPositiveInteger('abc', 20)).toBe(20);
    expect(readPositiveInteger('-1', 20)).toBe(20);
    expect(readPositiveInteger('30', 20)).toBe(30);
  });
});
