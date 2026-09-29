"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPerusahaan, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAccount, resetPassword } from "@/lib/accounts";
import { setSecretFlash } from "@/lib/flash-cookie";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v == null ? 0 : Number(v.replace(/[^\d.-]/g, "")) || 0;
};
const back = (path: string, msg: string, key: "ok" | "err" = "err") => redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

export async function simpanKaryawan(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const id = str(form, "id");
  const origin = id ? `/karyawan/${id}/edit` : "/karyawan/baru";

  const emp = {
    no_ktp: str(form, "no_ktp"),
    nama: str(form, "nama"),
    jenis_kelamin: str(form, "jenis_kelamin"),
    tempat_lahir: str(form, "tempat_lahir"),
    tanggal_lahir: str(form, "tanggal_lahir"),
    alamat_ktp: str(form, "alamat_ktp"),
    alamat_domisili: str(form, "alamat_domisili"),
    no_hp: str(form, "no_hp"),
    email: str(form, "email"),
    kontak_darurat_nama: str(form, "kontak_darurat_nama"),
    kontak_darurat_hubungan: str(form, "kontak_darurat_hubungan"),
    kontak_darurat_hp: str(form, "kontak_darurat_hp"),
    tanggal_masuk: str(form, "tanggal_masuk"),
    tanggal_keluar: str(form, "tanggal_keluar"),
    status: str(form, "status") ?? "aktif",
    jenis_kontrak: str(form, "jenis_kontrak") ?? "PKWT",
    no_kontrak: str(form, "no_kontrak"),
    tanggal_akhir_kontrak: str(form, "tanggal_akhir_kontrak"),
    classification_id: str(form, "classification_id"),
    area_id: str(form, "area_id"),
    team_id: str(form, "team_id"),
    no_bpjs_kesehatan: str(form, "no_bpjs_kesehatan"),
    no_bpjs_ketenagakerjaan: str(form, "no_bpjs_ketenagakerjaan"),
    mcu_tanggal: str(form, "mcu_tanggal"),
    mcu_berlaku_sampai: str(form, "mcu_berlaku_sampai"),
    ukuran_baju: str(form, "ukuran_baju"),
    ukuran_sepatu: str(form, "ukuran_sepatu"),
    catatan: str(form, "catatan"),
  };
  if (!emp.nama || !emp.tanggal_masuk) back(origin, "Nama dan tanggal masuk wajib diisi");

  let employeeId = id;
  let nik: string | null = null;
  if (id) {
    const { error } = await supabase.from("employees").update(emp).eq("id", id);
    if (error) back(origin, error.message);
  } else {
    const { data, error } = await supabase.from("employees").insert(emp).select("id, nik").single();
    if (error || !data) back(origin, error?.message ?? "Gagal menyimpan");
    employeeId = data!.id;
    nik = data!.nik;
  }

  const comp = {
    employee_id: employeeId,
    basis_gaji: str(form, "basis_gaji") ?? "bulanan",
    gaji_pokok: num(form, "gaji_pokok"),
    npwp: str(form, "npwp"),
    status_ptkp: str(form, "status_ptkp"),
    bank_nama: str(form, "bank_nama"),
    no_rekening: str(form, "no_rekening"),
    nama_rekening: str(form, "nama_rekening"),
  };
  const { error: cErr } = await supabase.from("employee_compensation").upsert(comp);
  if (cErr) back(`/karyawan/${employeeId}/edit`, cErr.message);

  // Tunjangan: ganti seluruh set
  const nama = form.getAll("tunj_nama").map(String);
  const jenis = form.getAll("tunj_jenis").map(String);
  const basis = form.getAll("tunj_basis").map(String);
  const jumlah = form.getAll("tunj_jumlah").map((v) => Number(String(v).replace(/[^\d.-]/g, "")) || 0);
  const tunj = nama
    .map((n, i) => ({ employee_id: employeeId, nama: n.trim(), jenis: jenis[i], basis: basis[i], jumlah: jumlah[i] }))
    .filter((t) => t.nama && t.jumlah > 0);
  await supabase.from("employee_allowances").delete().eq("employee_id", employeeId!);
  if (tunj.length) {
    const { error } = await supabase.from("employee_allowances").insert(tunj);
    if (error) back(`/karyawan/${employeeId}/edit`, error.message);
  }

  // Akun login otomatis untuk karyawan baru
  if (!id && form.get("buat_akun") === "on") {
    try {
      const p = await getPerusahaan();
      const acc = await createAccount({ full_name: emp.nama!, role: "karyawan", email: emp.email, phone: emp.no_hp, employee_id: employeeId, nik, domain: p.domain_email_karyawan });
      await setSecretFlash(`Akun login dibuat. Login: ${nik} / ${acc.email} — Password awal: ${acc.password}`);
    } catch (e) {
      back(`/karyawan/${employeeId}`, `Data tersimpan, tetapi ${(e as Error).message}`);
    }
  }
  revalidatePath("/karyawan");
  redirect(`/karyawan/${employeeId}?ok=${encodeURIComponent("Data karyawan tersimpan")}`);
}

export async function buatAkunKaryawan(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("employee_id"));
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("id, nik, nama, email, no_hp").eq("id", id).single();
  if (!e) back("/karyawan", "Karyawan tidak ditemukan");
  try {
    const p = await getPerusahaan();
    const acc = await createAccount({ full_name: e!.nama, role: "karyawan", email: e!.email, phone: e!.no_hp, employee_id: e!.id, nik: e!.nik, domain: p.domain_email_karyawan });
    await setSecretFlash(`Akun login dibuat. Login: ${e!.nik} / ${acc.email} — Password awal: ${acc.password}`);
  } catch (err) {
    back(`/karyawan/${id}`, (err as Error).message);
  }
  redirect(`/karyawan/${id}`);
}

export async function resetPasswordKaryawan(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("employee_id"));
  const supabase = await createClient();
  const { data: prof } = await supabase.from("profiles").select("id, role").eq("employee_id", id).maybeSingle();
  if (!prof) back(`/karyawan/${id}`, "Karyawan belum memiliki akun");
  // Admin biasa tidak boleh mereset password admin lain
  const s = await requireRole("super_admin", "admin");
  if (!s.isSuperAdmin && prof!.role !== "karyawan" && prof!.role !== "supervisor") back(`/karyawan/${id}`, "Hanya Super Admin yang dapat mereset akun admin");
  const pw = await resetPassword(prof!.id);
  await setSecretFlash(`Password direset. Password sementara: ${pw}`);
  redirect(`/karyawan/${id}`);
}

export async function hapusFlash() {
  (await cookies()).delete("mps_flash_secret");
}

export async function tambahSertifikat(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("employee_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("employee_certificates").insert({
    employee_id: id,
    nama: str(form, "nama"),
    nomor: str(form, "nomor"),
    berlaku_sampai: str(form, "berlaku_sampai"),
  });
  if (error) back(`/karyawan/${id}`, error.message);
  revalidatePath(`/karyawan/${id}`);
}

export async function hapusSertifikat(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  await supabase.from("employee_certificates").delete().eq("id", String(form.get("id")));
  revalidatePath(`/karyawan/${form.get("employee_id")}`);
}

const MAX_UPLOAD = 5 * 1024 * 1024;

export async function uploadDokumen(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("employee_id"));
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) back(`/karyawan/${id}`, "Pilih file terlebih dahulu");
  const f = file as File;
  if (f.size > MAX_UPLOAD) back(`/karyawan/${id}`, "Ukuran file maksimal 5 MB");
  const supabase = await createClient();
  const safe = f.name.replace(/[^\w.-]+/g, "_");
  const path = `${id}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("dokumen").upload(path, f, { contentType: f.type });
  if (error) back(`/karyawan/${id}`, error.message);
  await supabase.from("employee_documents").insert({ employee_id: id, jenis: str(form, "jenis") ?? "lainnya", nama_file: f.name, storage_path: path });
  revalidatePath(`/karyawan/${id}`);
  redirect(`/karyawan/${id}?ok=Dokumen+diunggah`);
}

export async function hapusDokumen(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const { data } = await supabase.from("employee_documents").select("*").eq("id", String(form.get("id"))).single();
  if (data) {
    await supabase.storage.from("dokumen").remove([data.storage_path]);
    await supabase.from("employee_documents").delete().eq("id", data.id);
  }
  revalidatePath(`/karyawan/${form.get("employee_id")}`);
}

export async function ubahStatus(form: FormData) {
  await requireRole("super_admin", "admin");
  const id = String(form.get("employee_id"));
  const status = String(form.get("status"));
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (["resign", "selesai_kontrak"].includes(status)) patch.tanggal_keluar = str(form, "tanggal_keluar") ?? new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("employees").update(patch).eq("id", id);
  if (error) back(`/karyawan/${id}`, error.message);
  // Nonaktifkan akun login bila karyawan keluar
  if (["resign", "selesai_kontrak", "non_aktif"].includes(status)) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().from("profiles").update({ active: false }).eq("employee_id", id).eq("role", "karyawan");
  } else {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().from("profiles").update({ active: true }).eq("employee_id", id).eq("role", "karyawan");
  }
  revalidatePath(`/karyawan/${id}`);
  redirect(`/karyawan/${id}?ok=Status+diperbarui`);
}
