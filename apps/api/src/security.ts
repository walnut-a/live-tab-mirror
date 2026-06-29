import { ALLOWED_EMAIL, normalizeEmail } from '@live-tab-mirror/shared';
import type { Env } from './types';

const textEncoder = new TextEncoder();

export function getAllowedEmail(env: Env): string {
  return normalizeEmail(env.ALLOWED_EMAIL || ALLOWED_EMAIL);
}

export function assertAllowedEmail(env: Env, email: string): string {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail !== getAllowedEmail(env)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return normalizedEmail;
}

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashWithSecret(value: string, secret: string): Promise<string> {
  if (!secret) {
    throw new Response('Server secret is not configured', { status: 500 });
  }
  return sha256Hex(`${value}.${secret}`);
}

export function generateLoginCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join('');
}

export function generateToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function adminSecretMatches(env: Env, value: string | null): Promise<boolean> {
  if (!env.ADMIN_CODE_SECRET || !value) {
    return false;
  }

  const [expected, actual] = await Promise.all([
    sha256Hex(env.ADMIN_CODE_SECRET),
    sha256Hex(value)
  ]);
  return expected === actual;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
