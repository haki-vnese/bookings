/**
 * Supabase client singleton.
 *
 * All backend code imports `supabase` from here so there is exactly
 * one PostgREST connection pool shared across the process.
 *
 * The client uses the anon key — row-level-security policies on the
 * Supabase side still apply.  Service-role operations (if any) would
 * need a second client with `SUPABASE_SERVICE_ROLE_KEY`.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export { supabase };