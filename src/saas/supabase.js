import { createClient } from "@supabase/supabase-js";

/** @typedef {import("./db").Database} Database */
/** @typedef {import("./db").MyContext} MyContext */
/** @typedef {import("./db").SetupAccountResult} SetupAccountResult */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が設定されていません。.env.local を確認してください。"
  );
}

/** @type {import("@supabase/supabase-js").SupabaseClient<Database, "saas">} */
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "viverce-saas-auth",
  },
  db: { schema: "saas" },
});

export async function setupAccount({ accountName, storeName, industry, displayName }) {
  const { data, error } = await supabase.rpc("setup_account", {
    p_account_name: accountName,
    p_store_name: storeName,
    p_industry: industry || "cabaret",
    p_display_name: displayName || null,
  });
  if (error) throw error;
  return data;
}

export async function getMyContext() {
  const { data, error } = await supabase.rpc("get_my_context");
  if (error) throw error;
  return data;
}
