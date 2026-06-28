import { ALLOWED_EMAIL } from './constants';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  return normalizeEmail(email) === ALLOWED_EMAIL;
}
