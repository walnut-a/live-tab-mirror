import { ALLOWED_EMAIL, DEFAULT_DEVICE_ID, DEFAULT_DEVICE_NAME } from '@live-tab-mirror/shared';
import { normalizeBackendProvider } from '@live-tab-mirror/shared';

export const extensionEnv = {
  backendProvider: normalizeBackendProvider(import.meta.env.VITE_BACKEND_PROVIDER),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  workerApiUrl: import.meta.env.VITE_WORKER_API_URL ?? '',
  allowedEmail: import.meta.env.VITE_ALLOWED_EMAIL ?? ALLOWED_EMAIL,
  deviceId: import.meta.env.VITE_DEVICE_ID ?? DEFAULT_DEVICE_ID,
  deviceName: import.meta.env.VITE_DEVICE_NAME ?? DEFAULT_DEVICE_NAME
};

export function isSupabaseConfigured(): boolean {
  return Boolean(extensionEnv.supabaseUrl && extensionEnv.supabasePublishableKey);
}

export function isBackendConfigured(): boolean {
  if (extensionEnv.backendProvider === 'worker') {
    return Boolean(extensionEnv.workerApiUrl);
  }

  return isSupabaseConfigured();
}
