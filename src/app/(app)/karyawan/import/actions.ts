"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getPerusahaan, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAccount } from "@/lib/accounts";
import { IMPORT_COLUMNS } from "@/lib/import-template";

export interface ImportResult {
  ok: number;
  gagal: { baris: number; nama: string; alasan: string }[];
  akun: { nik: string; nama: string; login: string; password: string }[];
  error?: string;
}

function cellValue(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v) return String((v as any).text ?? "");
    if ("result" in v) return String((v as any).result ?? "");
    if ("richText" in v) return (v as any).richText.map((r: any) => r.text).join("");
  }
  return String(v).trim();
}

/** Menerima DD/MM/YYYY, YYYY-MM-DD, atau tanggal Excel. */
function parseTanggal(v: string): string | null | "invalid" {
  if (!v) return null;
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "invalid";
}

export async function importKaryawan(_: ImportResult | null, form: FormData): Promise<ImportResult> {
  await requireRole("super_admin", "admin");
  const file = form.get("file");
  const buatAkun = form.get("buat_akun") === "on";
  if (!(file instanceof File) || !file.size) return { ok: 0, gagal: [], akun: [], error: "Pilih file Excel (.xlsx)." };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer() as any);
  } catch {
    return { ok: 0, gagal: [], akun: [], error: "File tidak dapat dibaca. Gunakan format .xlsx dari template." };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: 0, gagal: [], akun: [], error: "Sheet kosong." };

  // Petakan header → key (header template berisi keterangan dalam kurung)
  const headerRow = ws.getRow(1);
  const colIndex = new Map<string, number>();
  headerRow.eachCell((cell, i) => {
    const h = cellValue(cell.value).toLowerCase().replace(/\*|\(.*\)/g, "").trim();
    const col = IMPORT_COLUMNS.find((c) => c.key === h);
    if (col) colIndex.set(col.key, i);
  });
  if (!colIndex.has("nama") || !colIndex.has("tanggal_masuk")) {
    return { ok: 0, gagal: [], akun: [], error: "Header tidak sesuai template (kolom nama & tanggal_masuk wajib ada)." };
  }

  const supabase = await createClient();
  const [cls, areas, teams, existing] = await Promise.all([
    supabase.from("classifications").select("id, kode"),
    supabase.from("areas").select("id, nama"),
    supabase.from("teams").select("id, nama"),
    supabase.from("employees").select("no_ktp").not("no_ktp", "is", null).limit(100000),
  ]);
  const cMap = new Map((cls.data ?? []).map((x) => [x.kode.toUpperCase(), x.id]));
  const aMap = new Map((areas.data ?? []).map((x) => [x.nama.toLowerCase(), x.id]));
  const tMap = new Map((teams.data ?? []).map((x) => [x.nama.toLowerCase(), x.id]));
  const ktpSet = new Set((existing.data ?? []).map((x) => x.no_ktp));
  const perusahaan = await getPerusahaan();

  const result: ImportResult = { ok: 0, gagal: [], akun: [] };
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: string) => (colIndex.has(k) ? cellValue(row.getCell(colIndex.get(k)!).value) : "");
    const nama = get("nama");
    if (!nama && !get("tanggal_masuk")) continue; // baris kosong
    const err: string[] = [];
    if (!nama) err.push("nama kosong");
    const tglMasuk = parseTanggal(get("tanggal_masuk"));
    if (!tglMasuk || tglMasuk === "invalid") err.push("tanggal_masuk tidak valid");
    const tglLahir = parseTanggal(get("tanggal_lahir"));
    if (tglLahir === "invalid") err.push("tanggal_lahir tidak valid");
    const tglAkhir = parseTanggal(get("tanggal_akhir_kontrak"));
    if (tglAkhir === "invalid") err.push("tanggal_akhir_kontrak tidak valid");
    const ktp = get("no_ktp") || null;
    if (ktp && !/^\d{16}$/.test(ktp)) err.push("no_ktp harus 16 digit");
    if (ktp && ktpSet.has(ktp)) err.push("no_ktp sudah terdaftar");
    const kode = get("kode_klasifikasi").toUpperCase();
    if (kode && !cMap.has(kode)) err.push(`kode_klasifikasi "${kode}" tidak ada di master`);
    const area = get("area").toLowerCase();
    if (area && !aMap.has(area)) err.push(`area "${get("area")}" tidak ada di master`);
    const regu = get("regu").toLowerCase();
    if (regu && !tMap.has(regu)) err.push(`regu "${get("regu")}" tidak ada di master`);
    const jk = get("jenis_kelamin").toUpperCase();
    if (jk && !["L", "P"].includes(jk)) err.push("jenis_kelamin harus L/P");
    const kontrak = get("jenis_kontrak") || "PKWT";
    if (!["PKWT", "Harian"].includes(kontrak)) err.push("jenis_kontrak harus PKWT/Harian");
    const basis = (get("basis_gaji") || "bulanan").toLowerCase();
    if (!["bulanan", "harian"].includes(basis)) err.push("basis_gaji harus bulanan/harian");
    const n = (k: string) => Number(get(k).replace(/[^\d.]/g, "")) || 0;
    if (err.length) {
      result.gagal.push({ baris: r, nama: nama || "-", alasan: err.join("; ") });
      continue;
    }

    const { data: emp, error } = await supabase
      .from("employees")
      .insert({
        nama,
        no_ktp: ktp,
        jenis_kelamin: jk || null,
        tempat_lahir: get("tempat_lahir") || null,
        tanggal_lahir: tglLahir,
        alamat_ktp: get("alamat_ktp") || null,
        alamat_domisili: get("alamat_domisili") || null,
        no_hp: get("no_hp") || null,
        email: get("email") || null,
        tanggal_masuk: tglMasuk,
        jenis_kontrak: kontrak,
        no_kontrak: get("no_kontrak") || null,
        tanggal_akhir_kontrak: tglAkhir,
        classification_id: kode ? cMap.get(kode) : null,
        area_id: area ? aMap.get(area) : null,
        team_id: regu ? tMap.get(regu) : null,
        no_bpjs_kesehatan: get("no_bpjs_kesehatan") || null,
        no_bpjs_ketenagakerjaan: get("no_bpjs_ketenagakerjaan") || null,
        ukuran_baju: get("ukuran_baju") || null,
        ukuran_sepatu: get("ukuran_sepatu") || null,
      })
      .select("id, nik")
      .single();
    if (error || !emp) {
      result.gagal.push({ baris: r, nama, alasan: error?.message ?? "gagal simpan" });
      continue;
    }
    if (ktp) ktpSet.add(ktp);
    await supabase.from("employee_compensation").upsert({
      employee_id: emp.id,
      basis_gaji: basis,
      gaji_pokok: n("gaji_pokok"),
      bank_nama: get("bank") || null,
      no_rekening: get("no_rekening") || null,
      nama_rekening: get("nama_rekening") || null,
      npwp: get("npwp") || null,
      status_ptkp: get("status_ptkp") || null,
    });
    const tunj = [
      { nama: "Tunjangan tetap", jenis: "tetap", basis: "bulanan", jumlah: n("tunjangan_tetap") },
      { nama: "Uang makan", jenis: "tidak_tetap", basis: "harian", jumlah: n("tunjangan_makan_harian") },
      { nama: "Uang transport", jenis: "tidak_tetap", basis: "harian", jumlah: n("tunjangan_transport_harian") },
    ].filter((t) => t.jumlah > 0);
    if (tunj.length) await supabase.from("employee_allowances").insert(tunj.map((t) => ({ ...t, employee_id: emp.id })));

    if (buatAkun) {
      try {
        const acc = await createAccount({ full_name: nama, role: "karyawan", email: get("email") || null, phone: get("no_hp"), employee_id: emp.id, nik: emp.nik, domain: perusahaan.domain_email_karyawan });
        result.akun.push({ nik: emp.nik, nama, login: acc.email, password: acc.password });
      } catch (e) {
        result.gagal.push({ baris: r, nama, alasan: `Data tersimpan (${emp.nik}), akun gagal: ${(e as Error).message}` });
      }
    }
    result.ok++;
  }
  revalidatePath("/karyawan");
  return result;
}
