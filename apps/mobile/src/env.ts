import { ALLOWED_EMAIL } from '@live-tab-mirror/shared';

export const mobileEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  allowedEmail: import.meta.env.VITE_ALLOWED_EMAIL ?? ALLOWED_EMAIL
};

export function isSupabaseConfigured(): boolean {
  return Boolean(mobileEnv.supabaseUrl && mobileEnv.supabasePublishableKey);
}
