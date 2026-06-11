"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

function getClient() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

export async function operatorHeaders(): Promise<Record<string, string>> {
  const session = await getClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
