import { ALLOWED_EMAIL, DEFAULT_DEVICE_ID, DEFAULT_DEVICE_NAME } from '@live-tab-mirror/shared';

export const extensionEnv = {
  workerApiUrl: import.meta.env.VITE_WORKER_API_URL ?? '',
  allowedEmail: import.meta.env.VITE_ALLOWED_EMAIL ?? ALLOWED_EMAIL,
  deviceId: import.meta.env.VITE_DEVICE_ID ?? DEFAULT_DEVICE_ID,
  deviceName: import.meta.env.VITE_DEVICE_NAME ?? DEFAULT_DEVICE_NAME
};

export function isBackendConfigured(): boolean {
  return Boolean(extensionEnv.workerApiUrl);
}
