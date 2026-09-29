import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { dasarUpahLembur } from "./calc/overtime";
import { HARI_KERJA_STANDAR } from "./calc/payroll";
import type { OvertimeSettings } from "./calc/settings";

/**
 * Upah per jam lembur semua karyawan yang dapat dibaca user (RLS: admin semua,
 * karyawan dirinya, supervisor tidak ada). Map employee_id → Rp/jam.
 */
export async function upahPerJamMap(supabase: SupabaseClient, s: OvertimeSettings): Promise<Map<string, number>> {
  const [comps, allows] = await Promise.all([
    fetchAll((a, b) => supabase.from("employee_compensation").select("employee_id, basis_gaji, gaji_pokok").range(a, b)),
    fetchAll((a, b) => supabase.from("employee_allowances").select("employee_id, jenis, basis, jumlah").range(a, b)),
  ]);
  const tunj = new Map<string, { tetap: number; tidak: number }>();
  for (const a of allows as any[]) {
    const t = tunj.get(a.employee_id) ?? { tetap: 0, tidak: 0 };
    const v = Number(a.jumlah) * (a.basis === "harian" ? HARI_KERJA_STANDAR : 1);
    if (a.jenis === "tetap") t.tetap += v;
    else t.tidak += v;
    tunj.set(a.employee_id, t);
  }
  const out = new Map<string, number>();
  for (const c of comps as any[]) {
    const gp = c.basis_gaji === "harian" ? Number(c.gaji_pokok) * HARI_KERJA_STANDAR : Number(c.gaji_pokok);
    const t = tunj.get(c.employee_id) ?? { tetap: 0, tidak: 0 };
    out.set(c.employee_id, dasarUpahLembur({ gaji_pokok: gp, tunjangan_tetap: t.tetap, tunjangan_tidak_tetap: t.tidak }, s).dasar / s.pembagi_upah_jam);
  }
  return out;
}
