import { ALLOWED_EMAIL } from '@live-tab-mirror/shared';

export const mobileEnv = {
  workerApiUrl: import.meta.env.VITE_WORKER_API_URL ?? '',
  allowedEmail: import.meta.env.VITE_ALLOWED_EMAIL ?? ALLOWED_EMAIL
};

export function isBackendConfigured(): boolean {
  return Boolean(mobileEnv.workerApiUrl);
}
