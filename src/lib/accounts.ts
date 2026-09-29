import "server-only";
import { randomInt } from "crypto";
import { createAdminClient } from "./supabase/admin";
import { normalizePhone } from "./phone";
import type { Role } from "./types";

/** Password awal acak (wajib diganti saat login pertama). */
export function generatePassword(): string {
  const huruf = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const angka = "23456789";
  let p = "";
  for (let i = 0; i < 5; i++) p += huruf[randomInt(huruf.length)];
  for (let i = 0; i < 4; i++) p += angka[randomInt(angka.length)];
  return p;
}

export interface NewAccount {
  full_name: string;
  role: Role;
  email?: string | null;
  phone?: string | null;
  employee_id?: string | null;
  /** Dipakai bila email kosong: <nik>@<domain> (email sintetis, login tetap bisa via NIK/HP). */
  nik?: string | null;
  domain?: string;
}

export async function createAccount(a: NewAccount): Promise<{ email: string; password: string }> {
  const admin = createAdminClient();
  const email = (a.email?.trim() || `${(a.nik ?? crypto.randomUUID()).toLowerCase()}@${a.domain ?? "karyawan.local"}`).toLowerCase();
  const password = generatePassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: a.full_name } });
  if (error || !data.user) throw new Error(`Gagal membuat akun: ${error?.message}`);
  const phone = normalizePhone(a.phone);
  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id,
    role: a.role,
    full_name: a.full_name,
    email,
    phone: phone && /^0\d{8,}$/.test(phone) ? phone : null,
    employee_id: a.employee_id ?? null,
    must_change_password: true,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`Gagal membuat profil: ${pErr.message}`);
  }
  return { email, password };
}

export async function resetPassword(userId: string): Promise<string> {
  const admin = createAdminClient();
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  return password;
}
