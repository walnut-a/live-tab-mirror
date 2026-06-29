import { ALLOWED_EMAIL } from '@live-tab-mirror/shared';
import { normalizeBackendProvider } from '@live-tab-mirror/shared';

export const mobileEnv = {
  backendProvider: normalizeBackendProvider(import.meta.env.VITE_BACKEND_PROVIDER),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  workerApiUrl: import.meta.env.VITE_WORKER_API_URL ?? '',
  allowedEmail: import.meta.env.VITE_ALLOWED_EMAIL ?? ALLOWED_EMAIL
};

export function isSupabaseConfigured(): boolean {
  return Boolean(mobileEnv.supabaseUrl && mobileEnv.supabasePublishableKey);
}

export function isBackendConfigured(): boolean {
  if (mobileEnv.backendProvider === 'worker') {
    return Boolean(mobileEnv.workerApiUrl);
  }

  return isSupabaseConfigured();
}
