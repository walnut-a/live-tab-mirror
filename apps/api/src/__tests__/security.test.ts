import { describe, expect, it } from 'vitest';
import {
  adminSecretMatches,
  generateLoginCode,
  generateToken,
  getSessionExpirationIso,
  hashWithSecret,
  loginPasswordMatches,
  readPositiveInteger
} from '../security';
import type { Env } from '../types';

const env = {
  ADMIN_CODE_SECRET: 'admin-secret',
  LOGIN_PASSWORD: 'Stable-login-password-2026',
  SESSION_SECRET: 'session-secret'
} as Env;

describe('worker auth security helpers', () => {
  it('checks admin secrets through a hashed comparison', async () => {
    await expect(adminSecretMatches(env, 'admin-secret')).resolves.toBe(true);
    await expect(adminSecretMatches(env, 'wrong-secret')).resolves.toBe(false);
    await expect(adminSecretMatches(env, null)).resolves.toBe(false);
  });

  it('accepts the configured login password repeatedly', async () => {
    await expect(loginPasswordMatches(env, 'Stable-login-password-2026')).resolves.toBe(true);
    await expect(loginPasswordMatches(env, 'Stable-login-password-2026')).resolves.toBe(true);
    await expect(loginPasswordMatches(env, 'wrong-password')).resolves.toBe(false);
    await expect(loginPasswordMatches({ ...env, LOGIN_PASSWORD: '' }, 'anything')).resolves.toBe(false);
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

  it('supports explicitly non-expiring sessions without weakening numeric TTL validation', () => {
    const createdAt = new Date('2026-08-04T00:00:00.000Z');

    expect(getSessionExpirationIso('never', createdAt)).toBe('9999-12-31T23:59:59.999Z');
    expect(getSessionExpirationIso(' NEVER ', createdAt)).toBe('9999-12-31T23:59:59.999Z');
    expect(getSessionExpirationIso('30', createdAt)).toBe('2026-09-03T00:00:00.000Z');
    expect(getSessionExpirationIso('invalid', createdAt)).toBe('2026-09-03T00:00:00.000Z');
  });
});
