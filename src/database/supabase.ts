import { createClient } from '@supabase/supabase-js';
import { requireSupabaseEnv } from '../config/env';

const { supabaseUrl, supabaseKey } = requireSupabaseEnv();

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
