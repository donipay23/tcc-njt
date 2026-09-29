"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface AbsensiRow {
  employee_id: string;
  status_kehadiran: string;
  jam_masuk: string | null;
  jam_keluar: string | null;
  lokasi: string | null;
  keterangan: string | null;
}

const STATUS = ["hadir", "sakit", "izin", "alpa", "cuti", "libur"];
const TIME = /^\d{2}:\d{2}$/;

export async function simpanAbsensi(tanggal: string, rows: AbsensiRow[]): Promise<{ ok: number; error?: string; dilewati: number }> {
  await requireRole("super_admin", "admin", "supervisor");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { ok: 0, dilewati: 0, error: "Tanggal tidak valid" };
  const supabase = await createClient();
  const ids = rows.map((r) => r.employee_id);
  const { data: locked } = await supabase.from("timesheets").select("employee_id").eq("tanggal", tanggal).eq("approval_status", "approved").in("employee_id", ids);
  const skip = new Set((locked ?? []).map((x) => x.employee_id));
  const payload = rows
    .filter((r) => !skip.has(r.employee_id) && STATUS.includes(r.status_kehadiran))
    .map((r) => {
      const hadir = r.status_kehadiran === "hadir";
      return {
        employee_id: r.employee_id,
        tanggal,
        status_kehadiran: r.status_kehadiran,
        jam_masuk: hadir && r.jam_masuk && TIME.test(r.jam_masuk) ? r.jam_masuk : null,
        jam_keluar: hadir && r.jam_keluar && TIME.test(r.jam_keluar) ? r.jam_keluar : null,
        lokasi: r.lokasi?.slice(0, 200) || null,
        keterangan: r.keterangan?.slice(0, 500) || null,
        approval_status: "submitted",
      };
    });
  if (!payload.length) return { ok: 0, dilewati: skip.size };
  const { error } = await supabase.from("timesheets").upsert(payload, { onConflict: "employee_id,tanggal" });
  if (error) return { ok: 0, dilewati: skip.size, error: error.message };
  revalidatePath("/absensi");
  return { ok: payload.length, dilewati: skip.size };
}

export async function hapusAbsensi(employeeId: string, tanggal: string) {
  await requireRole("super_admin", "admin", "supervisor");
  const supabase = await createClient();
  const { error } = await supabase.from("timesheets").delete().eq("employee_id", employeeId).eq("tanggal", tanggal);
  return { error: error?.message };
}

function backUrl(form: FormData, msg: string, key: "ok" | "err") {
  const u = new URLSearchParams();
  for (const k of ["mulai", "selesai", "regu", "status"]) {
    const v = form.get(k);
    if (typeof v === "string" && v) u.set(k, v);
  }
  u.set(key, msg);
  return `/absensi/approval?${u}`;
}

/** Approve massal semua timesheet menunggu pada rentang (dan regu) terpilih. */
export async function approveMassal(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const mulai = String(form.get("mulai"));
  const selesai = String(form.get("selesai"));
  const regu = String(form.get("regu") ?? "");
  let q = supabase.from("timesheets").update({ approval_status: "approved" }, { count: "exact" }).eq("approval_status", "submitted").gte("tanggal", mulai).lte("tanggal", selesai);
  if (regu) {
    const { data } = await supabase.from("employees").select("id").eq("team_id", regu);
    q = q.in("employee_id", (data ?? []).map((x) => x.id));
  }
  const { error, count } = await q;
  if (error) redirect(backUrl(form, error.message, "err"));
  revalidatePath("/absensi");
  redirect(backUrl(form, `${count ?? 0} timesheet di-approve`, "ok"));
}

export async function approvePilihan(form: FormData) {
  await requireRole("super_admin", "admin");
  const ids = form.getAll("ids").map(String);
  const aksi = String(form.get("aksi"));
  const catatan = String(form.get("catatan") ?? "") || null;
  if (!ids.length) redirect(backUrl(form, "Tidak ada baris dipilih", "err"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("timesheets")
    .update(aksi === "reject" ? { approval_status: "rejected", catatan_approval: catatan } : { approval_status: "approved", catatan_approval: catatan })
    .in("id", ids);
  if (error) redirect(backUrl(form, error.message, "err"));
  revalidatePath("/absensi");
  redirect(backUrl(form, `${ids.length} timesheet ${aksi === "reject" ? "ditolak" : "di-approve"}`, "ok"));
}
