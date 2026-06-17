"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";

export async function operatorHeaders(): Promise<Record<string, string>> {
  const session = await getSupabaseBrowserClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
