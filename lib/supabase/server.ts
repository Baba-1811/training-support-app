import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cookieOptions, supabaseConfig } from "./config";

// RSCs cannot write cookies; Proxy refreshes them before rendering.
export async function createClient(writable = false) {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        if (!writable) return;
        values.forEach(({ name, value, options }) => store.set(name, value, options));
      },
    },
  });
}
