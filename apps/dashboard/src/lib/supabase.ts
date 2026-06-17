"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __alfaOmegaSupabaseClient: SupabaseClient | null | undefined;
}

export function getSupabaseBrowserClient() {
  if (globalThis.__alfaOmegaSupabaseClient !== undefined) {
    return globalThis.__alfaOmegaSupabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  globalThis.__alfaOmegaSupabaseClient =
    supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  return globalThis.__alfaOmegaSupabaseClient;
}

export const supabase = getSupabaseBrowserClient();
