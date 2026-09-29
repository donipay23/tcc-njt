import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Klien Supabase atas nama user yang login (RLS berlaku). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // dipanggil dari Server Component — diabaikan, middleware yang me-refresh sesi
        }
      },
    },
  });
}
