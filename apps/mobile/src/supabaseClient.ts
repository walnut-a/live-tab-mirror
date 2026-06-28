import { createClient } from '@supabase/supabase-js';
import { mobileEnv } from './env';

const fallbackUrl = 'https://example.supabase.co';
const fallbackKey = 'missing-publishable-key';

export const supabase = createClient(
  mobileEnv.supabaseUrl || fallbackUrl,
  mobileEnv.supabasePublishableKey || fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
);
