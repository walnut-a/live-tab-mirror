import { createClient } from '@supabase/supabase-js';
import { extensionEnv } from './env';
import { chromeStorageAdapter } from './storage';

const fallbackUrl = 'https://example.supabase.co';
const fallbackKey = 'missing-publishable-key';

export const supabase = createClient(
  extensionEnv.supabaseUrl || fallbackUrl,
  extensionEnv.supabasePublishableKey || fallbackKey,
  {
    auth: {
      storage: chromeStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  }
);
