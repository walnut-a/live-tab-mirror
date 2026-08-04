import { ALLOWED_EMAIL } from './constants';

export interface PasswordLoginViewOptions {
  busy: boolean;
  configured: boolean;
  password: string;
  minPasswordLength?: number;
}

export interface PasswordLoginViewState {
  verifyButtonDisabled: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  return normalizeEmail(email) === ALLOWED_EMAIL;
}

export function getPasswordLoginViewState({
  busy,
  configured,
  password,
  minPasswordLength = 12
}: PasswordLoginViewOptions): PasswordLoginViewState {
  return {
    verifyButtonDisabled: busy || !configured || password.trim().length < minPasswordLength
  };
}
