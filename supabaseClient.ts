import { createClient } from '@supabase/supabase-js';

// Vite expõe variáveis via import.meta.env
const url = (import.meta as any).env.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Cliente Supabase (nullable):
 * - `null` quando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estão configuradas.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = () => Boolean(url && anonKey);
