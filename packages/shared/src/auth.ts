import { ALLOWED_EMAIL } from './constants';

export interface OtpLoginViewOptions {
  busy: boolean;
  configured: boolean;
  token: string;
  minTokenLength?: number;
}

export interface OtpLoginViewState {
  verifyButtonDisabled: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  return normalizeEmail(email) === ALLOWED_EMAIL;
}

export function getOtpLoginViewState({
  busy,
  configured,
  token,
  minTokenLength = 6
}: OtpLoginViewOptions): OtpLoginViewState {
  return {
    verifyButtonDisabled: busy || !configured || token.trim().length < minTokenLength
  };
}
