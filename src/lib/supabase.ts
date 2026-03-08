import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

type SupabaseAccessTokenGetter = () => Promise<string | null>;

let supabaseAccessTokenGetter: SupabaseAccessTokenGetter | null = null;

export const setSupabaseAccessTokenGetter = (getter: SupabaseAccessTokenGetter | null) => {
  supabaseAccessTokenGetter = getter;
};

export const isSupabaseConfigured =
  typeof supabaseUrl === "string" &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === "string" &&
  supabaseAnonKey.length > 0;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      accessToken: async () => {
        if (!supabaseAccessTokenGetter) return null;
        return supabaseAccessTokenGetter();
      },
    })
  : null;
