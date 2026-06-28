import { ALLOWED_EMAIL } from './constants';

export interface OtpLoginViewOptions {
  busy: boolean;
  configured: boolean;
  otpSent: boolean;
  token: string;
  minTokenLength?: number;
}

export interface OtpLoginViewState {
  showTokenInput: true;
  sendButtonDisabled: boolean;
  sendButtonLabel: '发送验证码' | '验证码已发送';
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
  otpSent,
  token,
  minTokenLength = 6
}: OtpLoginViewOptions): OtpLoginViewState {
  return {
    showTokenInput: true,
    sendButtonDisabled: busy || otpSent || !configured,
    sendButtonLabel: otpSent ? '验证码已发送' : '发送验证码',
    verifyButtonDisabled: busy || token.trim().length < minTokenLength
  };
}
