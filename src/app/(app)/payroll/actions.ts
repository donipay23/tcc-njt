"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { hitungPayroll, type Tunjangan } from "@/lib/calc/payroll";

const back = (id: string, msg: string, key: "ok" | "err" = "ok") => redirect(`/payroll/${id}?${key}=${encodeURIComponent(msg)}`);

export async function buatPeriode(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const mulai = String(form.get("mulai"));
  const selesai = String(form.get("selesai"));
  const nama = String(form.get("nama") || `${mulai} s/d ${selesai}`);
  const { data: overlap } = await supabase.from("payroll_periods").select("nama").lte("mulai", selesai).gte("selesai", mulai).limit(1);
  if (overlap?.length) redirect(`/payroll?err=${encodeURIComponent(`Periode tumpang tindih dengan "${overlap[0].nama}"`)}`);
  const { data, error } = await supabase.from("payroll_periods").insert({ nama, mulai, selesai, tanggal_bayar: form.get("tanggal_bayar") || null }).select("id").single();
  if (error) redirect(`/payroll?err=${encodeURIComponent(error.message)}`);
  redirect(`/payroll/${data!.id}?ok=Periode+dibuat`);
}

export async function hitungPeriode(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("period_id"));
  const supabase = await createClient();
  const settings = await getSettings();
  const { data: p } = await supabase.from("payroll_periods").select("*").eq("id", id).single();
  if (!p) back(id, "Periode tidak ditemukan", "err");
  if (p!.status === "locked") back(id, "Periode sudah dikunci", "err");

  const [emps, rekap, comps, allows, existing] = await Promise.all([
    fetchAll((a, b) =>
      supabase.from("employees").select("id, tanggal_masuk, tanggal_keluar, classification_id, team_id, area_id").lte("tanggal_masuk", p!.selesai).or(`tanggal_keluar.is.null,tanggal_keluar.gte.${p!.mulai}`).range(a, b),
    ),
    fetchAll((a, b) => supabase.rpc("rekap_timesheet", { p_mulai: p!.mulai, p_selesai: p!.selesai, p_hanya_approved: true }).range(a, b)),
    fetchAll((a, b) => supabase.from("employee_compensation").select("employee_id, basis_gaji, gaji_pokok").range(a, b)),
    fetchAll((a, b) => supabase.from("employee_allowances").select("employee_id, nama, jenis, basis, jumlah").range(a, b)),
    fetchAll((a, b) => supabase.from("payroll").select("employee_id, pph21, potongan_lain, potongan_keterangan").eq("period_id", id).range(a, b)),
  ]);
  const rekapMap = new Map((rekap as any[]).map((r) => [r.employee_id, r]));
  const compMap = new Map((comps as any[]).map((c) => [c.employee_id, c]));
  const exMap = new Map((existing as any[]).map((x) => [x.employee_id, x]));
  const allowMap = new Map<string, Tunjangan[]>();
  for (const a of allows as any[]) {
    const l = allowMap.get(a.employee_id) ?? [];
    l.push({ nama: a.nama, jenis: a.jenis, basis: a.basis, jumlah: Number(a.jumlah) });
    allowMap.set(a.employee_id, l);
  }

  const rows: any[] = [];
  for (const e of emps as any[]) {
    const c = compMap.get(e.id);
    const r = rekapMap.get(e.id);
    const ex = exMap.get(e.id);
    const tunj = allowMap.get(e.id) ?? [];
    const res = hitungPayroll(
      {
        periode: { mulai: p!.mulai, selesai: p!.selesai },
        karyawan: { tanggal_masuk: e.tanggal_masuk, tanggal_keluar: e.tanggal_keluar },
        gaji_pokok: Number(c?.gaji_pokok ?? 0),
        basis_gaji: c?.basis_gaji ?? "bulanan",
        tunjangan: tunj,
        rekap: {
          hari_hadir: r?.hari_hadir ?? 0,
          hari_hadir_kerja: r?.hari_hadir_kerja ?? 0,
          jam_aktual: Number(r?.jam_aktual ?? 0),
          jam_normal: Number(r?.jam_normal ?? 0),
          jam_lembur: Number(r?.jam_lembur ?? 0),
          jam_konversi: Number(r?.jam_konversi ?? 0),
        },
        pph21: Number(ex?.pph21 ?? 0),
        potongan_lain: Number(ex?.potongan_lain ?? 0),
      },
      settings,
    );
    if (res.bruto === 0 && res.biaya_perusahaan === 0) continue;
    rows.push({
      period_id: id,
      employee_id: e.id,
      classification_id: e.classification_id,
      team_id: e.team_id,
      area_id: e.area_id,
      basis_gaji: c?.basis_gaji ?? "bulanan",
      hari_hadir: res.hari_hadir,
      jam_aktual: res.jam_aktual,
      jam_normal: res.jam_normal,
      jam_lembur: res.jam_lembur,
      jam_konversi: res.jam_konversi,
      faktor_prorata: res.faktor_prorata,
      gaji_pokok: res.gaji_pokok,
      tunjangan_tetap: res.tunjangan_tetap,
      tunjangan_tidak_tetap: res.tunjangan_tidak_tetap,
      dasar_upah_lembur: res.dasar_upah_lembur,
      upah_per_jam: res.upah_per_jam,
      upah_lembur: res.upah_lembur,
      bruto: res.bruto,
      bpjs_perusahaan: res.bpjs_perusahaan,
      bpjs_perusahaan_total: res.bpjs_perusahaan.total,
      bpjs_karyawan: res.bpjs_karyawan,
      bpjs_karyawan_total: res.bpjs_karyawan.total,
      thr_cadangan: res.thr_cadangan,
      kompensasi_cadangan: res.kompensasi_cadangan,
      pph21: res.pph21,
      potongan_lain: res.potongan_lain,
      potongan_keterangan: ex?.potongan_keterangan ?? null,
      take_home_pay: res.take_home_pay,
      biaya_perusahaan: res.biaya_perusahaan,
      detail: {
        tunjangan: tunj,
        gaji_pokok_input: Number(c?.gaji_pokok ?? 0),
        pph21_mode: settings.payroll.pph21_mode,
        prorata_metode: settings.payroll.prorata_metode,
        bpjs: settings.bpjs,
        lembur: { pembagi: settings.lembur.pembagi_upah_jam },
        dihitung_pada: new Date().toISOString(),
      },
    });
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("payroll").upsert(rows.slice(i, i + 500), { onConflict: "period_id,employee_id" });
    if (error) back(id, error.message, "err");
  }
  const keep = new Set(rows.map((r) => r.employee_id));
  const stale = (existing as any[]).map((x) => x.employee_id).filter((eid) => !keep.has(eid));
  if (stale.length) await supabase.from("payroll").delete().eq("period_id", id).in("employee_id", stale);
  revalidatePath(`/payroll/${id}`);
  back(id, `Payroll dihitung untuk ${rows.length} karyawan (hanya timesheet approved).`);
}

export async function ubahPotongan(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("period_id"));
  const rowId = String(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("payroll")
    .update({
      pph21: Number(form.get("pph21")) || 0,
      potongan_lain: Number(form.get("potongan_lain")) || 0,
      potongan_keterangan: String(form.get("potongan_keterangan") ?? "") || null,
    })
    .eq("id", rowId);
  if (error) back(id, error.message, "err");
  // Hitung ulang agar THP & biaya ikut berubah
  const f = new FormData();
  f.set("period_id", id);
  await hitungPeriode(f);
}

export async function kunciPeriode(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("period_id"));
  const supabase = await createClient();
  const { count } = await supabase.from("payroll").select("id", { count: "exact", head: true }).eq("period_id", id);
  if (!count) back(id, "Hitung payroll terlebih dahulu sebelum mengunci", "err");
  const { error } = await supabase.from("payroll_periods").update({ status: "locked" }).eq("id", id);
  if (error) back(id, error.message, "err");
  revalidatePath("/payroll");
  back(id, "Periode dikunci. Slip gaji kini dapat diunduh karyawan.");
}

export async function bukaPeriode(form: FormData) {
  await requireRole("super_admin");
  const id = String(form.get("period_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_periods").update({ status: "open" }).eq("id", id);
  if (error) back(id, error.message, "err");
  back(id, "Periode dibuka kembali (tercatat di audit log).");
}
