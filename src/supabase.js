import { createClient } from '@supabase/supabase-js'

// Public values: the publishable key is safe in the browser, data is protected by RLS.
export const SUPABASE_URL = 'https://kjfihzskaqcboeejnkak.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_COFa-LU5E_xbskpKMeQFnw_q0PUWq4u'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'nx-auth' },
})
