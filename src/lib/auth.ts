import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { mergeSettings, type AppSettings } from "./calc/settings";
import type { Profile, Role } from "./types";

export interface Session {
  userId: string;
  profile: Profile;
  role: Role;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canFinance: boolean;
}

/** Sesi user + profil (di-cache per request). Redirect ke /login bila belum login. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login?pesan=Akun+tidak+aktif");
  }
  const role = profile.role as Role;
  const settings = await getSettings();
  return {
    userId: user.id,
    profile: profile as Profile,
    role,
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    canFinance: role === "super_admin" || (role === "admin" && settings.admin_akses_keuangan),
  };
});

/** Hentikan akses bila role tidak termasuk. Keamanan utama tetap di RLS database. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!roles.includes(s.role)) redirect("/dashboard?err=Anda+tidak+memiliki+akses+ke+halaman+tersebut");
  return s;
}

export async function requireFinance(): Promise<Session> {
  const s = await getSession();
  if (!s.canFinance) redirect("/dashboard?err=Akses+keuangan+tidak+diizinkan");
  return s;
}

export const getSettings = cache(async (): Promise<AppSettings & { raw: Record<string, any> }> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value");
  const raw = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return { ...mergeSettings(data), raw };
});

export async function getPerusahaan() {
  const s = await getSettings();
  const p = (s.raw.perusahaan ?? {}) as Record<string, string>;
  return {
    nama: p.nama ?? "Kontraktor",
    klien: p.klien ?? "Klien",
    no_kontrak: p.no_kontrak ?? "",
    domain_email_karyawan: p.domain_email_karyawan ?? "karyawan.local",
    tanggal_mulai_periode: Number((s.raw.periode as any)?.tanggal_mulai ?? 1),
  };
}
