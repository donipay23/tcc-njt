"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { LOGIN_AT_COOKIE, SESSION_HOURS } from "@/lib/session-const";

export interface LoginState {
  error?: string;
}

/** Mengubah NIK / No. HP / email menjadi email login (dilakukan di server dengan service role). */
async function resolveEmail(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (id.includes("@")) return id.toLowerCase();
  const admin = createAdminClient();
  const phone = normalizePhone(id);
  if (phone && /^0\d{8,}$/.test(phone)) {
    const { data } = await admin.from("profiles").select("email").eq("phone", phone).maybeSingle();
    if (data) return data.email;
  }
  const { data: emp } = await admin.from("employees").select("id").eq("nik", id.toUpperCase()).maybeSingle();
  if (emp) {
    const { data } = await admin.from("profiles").select("email").eq("employee_id", emp.id).maybeSingle();
    if (data) return data.email;
  }
  return null;
}

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const identifier = String(form.get("identifier") ?? "");
  const password = String(form.get("password") ?? "");
  if (!identifier || !password) return { error: "Isi NIK / No. HP / email dan password." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = h.get("user-agent");
  const admin = createAdminClient();

  const email = await resolveEmail(identifier);
  const supabase = await createClient();
  const { data, error } = email
    ? await supabase.auth.signInWithPassword({ email, password })
    : { data: { user: null }, error: { message: "not found" } };

  await admin.from("login_logs").insert({ user_id: data.user?.id ?? null, identifier, success: !error, ip, user_agent: ua });
  if (error || !data.user) return { error: "Login gagal. Periksa kembali NIK / No. HP / email dan password." };

  const { data: profile } = await admin.from("profiles").select("active").eq("id", data.user.id).single();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "Akun Anda tidak aktif. Hubungi Admin." };
  }

  (await cookies()).set(LOGIN_AT_COOKIE, String(Date.now()), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: SESSION_HOURS * 3600 });
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(LOGIN_AT_COOKIE);
  redirect("/login");
}
