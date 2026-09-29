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
  /** Diisi bila data diinput saat offline lalu disinkron (waktu input di HP, ISO). */
  dicatat_pada?: string | null;
}

const STATUS = ["hadir", "sakit", "izin", "alpa", "cuti", "libur"];
const TIME = /^\d{2}:\d{2}$/;

export async function simpanAbsensi(tanggal: string, rows: AbsensiRow[]): Promise<{ ok: number; error?: string; dilewati: number; dilewati_ids?: string[] }> {
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
        offline_dicatat_pada: r.dicatat_pada && !isNaN(Date.parse(r.dicatat_pada)) ? r.dicatat_pada : null,
      };
    });
  const dilewati_ids = [...skip];
  if (!payload.length) return { ok: 0, dilewati: skip.size, dilewati_ids };
  const { error } = await supabase.from("timesheets").upsert(payload, { onConflict: "employee_id,tanggal" });
  if (error) return { ok: 0, dilewati: skip.size, dilewati_ids, error: error.message };
  revalidatePath("/absensi");
  return { ok: payload.length, dilewati: skip.size, dilewati_ids };
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

/**
 * Koreksi timesheet yang sudah di-approve — hanya Super Admin (juga dijaga trigger database).
 * Status tetap approved; jam dihitung ulang oleh trigger, alasan disimpan di catatan_approval,
 * dan perubahan tercatat di audit log atas nama Super Admin.
 */
export async function koreksiTimesheet(form: FormData) {
  await requireRole("super_admin");
  const id = String(form.get("id"));
  const back = (key: "ok" | "err", msg: string) => redirect(`/absensi/koreksi/${id}?${key}=${encodeURIComponent(msg)}`);
  const alasan = String(form.get("alasan") ?? "").trim();
  const status = String(form.get("status_kehadiran"));
  const masuk = String(form.get("jam_masuk") ?? "");
  const keluar = String(form.get("jam_keluar") ?? "");
  if (alasan.length < 5) back("err", "Isi alasan koreksi (minimal 5 karakter)");
  if (!STATUS.includes(status)) back("err", "Status kehadiran tidak valid");
  const hadir = status === "hadir";
  if (hadir && (!TIME.test(masuk) || !TIME.test(keluar))) back("err", "Jam masuk dan keluar wajib diisi (HH:MM) untuk status Hadir");

  const supabase = await createClient();
  const { data: ts } = await supabase.from("timesheets").select("approval_status").eq("id", id).maybeSingle();
  if (!ts) back("err", "Timesheet tidak ditemukan");
  if (ts!.approval_status !== "approved") back("err", "Hanya timesheet yang sudah di-approve yang dikoreksi di sini; lainnya lewat Input Absensi");

  const { error } = await supabase
    .from("timesheets")
    .update({
      status_kehadiran: status,
      jam_masuk: hadir ? masuk : null,
      jam_keluar: hadir ? keluar : null,
      lokasi: String(form.get("lokasi") ?? "").slice(0, 200) || null,
      keterangan: String(form.get("keterangan") ?? "").slice(0, 500) || null,
      catatan_approval: `Koreksi Super Admin: ${alasan.slice(0, 300)}`,
    })
    .eq("id", id);
  if (error) back("err", error.message);
  revalidatePath("/absensi");
  back("ok", "Koreksi disimpan. Jam dihitung ulang dan tercatat di audit log.");
}
