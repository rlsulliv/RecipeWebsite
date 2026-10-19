import { createClient } from '@supabase/supabase-js'

// These two values are public by design. Your recipes are protected by the
// login and the Row Level Security policy in Supabase, not by hiding these.
export const supabase = createClient(
  'https://ixuuxjutpfapoxoglrlh.supabase.co',
  'sb_publishable_qGS-MM7pJaj98BcEZXRHNA_UpY21676'
)
