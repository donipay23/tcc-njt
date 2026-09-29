import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Klien service-role (melewati RLS). HANYA dipakai di server untuk operasi yang
 * memang butuh hak penuh: membuat akun login, reset password, mencatat login log.
 * Selalu cek role pemanggil sebelum memakainya.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
