"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

/** Cliente de Supabase para el navegador (sesión persistida en localStorage). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!hasSupabaseConfig) {
      throw new Error("Supabase no está configurado (faltan variables de entorno).");
    }
    client = createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  }
  return client;
}
