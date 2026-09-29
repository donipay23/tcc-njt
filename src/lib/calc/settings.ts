import { PASAL17, TER_A, TER_B, TER_C } from "./pph21";
/**
 * Parameter perhitungan. Nilai default mengikuti Kepmenakertrans KEP-102/MEN/VI/2004
 * jo. PP 35/2021 dan tarif BPJS yang umum berlaku. Nilai sebenarnya dibaca dari tabel
 * `settings` di database dan dapat diubah Super Admin — kode tidak boleh meng-hardcode
 * angka di luar default ini.
 */

/** Satu tingkat pengali: berlaku untuk jam ke-(batas sebelumnya + 1) s/d jam ke-`sampai`. */
export interface Tier {
  /** Batas atas jam (kumulatif) untuk tingkat ini. `null` = tak terbatas. */
  sampai: number | null;
  pengali: number;
}

export interface BreakWindow {
  mulai: string; // "HH:MM"
  selesai: string; // "HH:MM"
}

export interface OvertimeSettings {
  pembagi_upah_jam: number; // 173
  jam_normal_harian: number; // 8
  /** Pengali lembur hari kerja, dihitung atas jam LEMBUR (di atas jam normal). */
  pengali_hari_kerja: Tier[];
  /** Pengali hari istirahat/libur (pola 5 hari kerja), dihitung atas SELURUH jam kerja. */
  pengali_hari_libur: Tier[];
  jam_istirahat: BreakWindow[];
  /** Hari kerja dalam seminggu, 0 = Minggu … 6 = Sabtu. */
  hari_kerja: number[];
  batas_lembur_harian: number; // 4
  batas_lembur_mingguan: number; // 18
  batas_jam_kerja_harian: number; // 12
  /** Ambang 75% untuk dasar upah lembur bila ada tunjangan tidak tetap. */
  rasio_upah_tetap_minimum: number; // 0.75
}

export interface BpjsSettings {
  kes_perusahaan: number; // 0.04
  kes_karyawan: number; // 0.01
  kes_batas_upah: number; // batas atas upah BPJS Kesehatan
  jkk: number; // tergantung tingkat risiko, mis. 0.0089 / 0.0174
  jkm: number; // 0.003
  jht_perusahaan: number; // 0.037
  jht_karyawan: number; // 0.02
  jp_perusahaan: number; // 0.02
  jp_karyawan: number; // 0.01
  jp_batas_upah: number;
}

export type ProrataMetode = "hari_kerja" | "kalender_30";
export type Pph21Mode = "tidak_dihitung" | "ditanggung_perusahaan" | "dipotong_karyawan" | "gross_up";

/** Parameter PPh 21 (PP 58/2023, PMK 168/2023, UU HPP). */
export interface Pph21Settings {
  ptkp_dasar: number; // 54.000.000
  ptkp_kawin: number; // 4.500.000
  ptkp_tanggungan: number; // 4.500.000 per tanggungan (maks. 3)
  biaya_jabatan_persen: number; // 0.05
  biaya_jabatan_maks_bulan: number; // 500.000 per bulan (6 jt setahun)
  /** Tabel TER bulanan kategori A/B/C: [batas atas bruto, tarif %]. */
  ter: Record<"A" | "B" | "C", [number | null, number][]>;
  /** Lapisan tarif Pasal 17: [batas atas PKP, tarif %]. */
  pasal17: [number | null, number][];
}

export interface PayrollSettings {
  prorata_metode: ProrataMetode;
  /** Pembagi prorata hari kerja (mis. 21). Jika null, memakai jumlah hari kerja aktual dalam periode. */
  prorata_pembagi_hari_kerja: number | null;
  thr_cadangan: boolean;
  kompensasi_pkwt_cadangan: boolean;
  pph21_mode: Pph21Mode;
}

export interface TaxSettings {
  ppn_tarif: number; // 0.12
  /** Faktor DPP nilai lain, mis. 11/12. 1 = DPP penuh. */
  ppn_dpp_faktor: number;
  pph23_tarif: number; // 0.02
  termin_hari: number; // TOP, mis. 30
}

export interface AppSettings {
  lembur: OvertimeSettings;
  pph21: Pph21Settings;
  bpjs: BpjsSettings;
  payroll: PayrollSettings;
  pajak: TaxSettings;
  target_margin: number; // 0.15
  admin_akses_keuangan: boolean;
}

export const DEFAULT_OVERTIME: OvertimeSettings = {
  pembagi_upah_jam: 173,
  jam_normal_harian: 8,
  pengali_hari_kerja: [
    { sampai: 1, pengali: 1.5 },
    { sampai: null, pengali: 2 },
  ],
  pengali_hari_libur: [
    { sampai: 8, pengali: 2 },
    { sampai: 9, pengali: 3 },
    { sampai: null, pengali: 4 },
  ],
  jam_istirahat: [{ mulai: "12:00", selesai: "13:00" }],
  hari_kerja: [1, 2, 3, 4, 5],
  batas_lembur_harian: 4,
  batas_lembur_mingguan: 18,
  batas_jam_kerja_harian: 12,
  rasio_upah_tetap_minimum: 0.75,
};

export const DEFAULT_BPJS: BpjsSettings = {
  kes_perusahaan: 0.04,
  kes_karyawan: 0.01,
  kes_batas_upah: 12_000_000,
  jkk: 0.0089,
  jkm: 0.003,
  jht_perusahaan: 0.037,
  jht_karyawan: 0.02,
  jp_perusahaan: 0.02,
  jp_karyawan: 0.01,
  jp_batas_upah: 10_547_400,
};

export const DEFAULT_PAYROLL: PayrollSettings = {
  prorata_metode: "kalender_30",
  prorata_pembagi_hari_kerja: null,
  thr_cadangan: true,
  kompensasi_pkwt_cadangan: true,
  pph21_mode: "tidak_dihitung",
};

export const DEFAULT_TAX: TaxSettings = {
  ppn_tarif: 0.12,
  ppn_dpp_faktor: 11 / 12,
  pph23_tarif: 0.02,
  termin_hari: 30,
};

export const DEFAULT_PPH21: Pph21Settings = {
  ptkp_dasar: 54_000_000,
  ptkp_kawin: 4_500_000,
  ptkp_tanggungan: 4_500_000,
  biaya_jabatan_persen: 0.05,
  biaya_jabatan_maks_bulan: 500_000,
  ter: { A: TER_A, B: TER_B, C: TER_C },
  pasal17: PASAL17,
};

export const DEFAULT_SETTINGS: AppSettings = {
  lembur: DEFAULT_OVERTIME,
  pph21: DEFAULT_PPH21,
  bpjs: DEFAULT_BPJS,
  payroll: DEFAULT_PAYROLL,
  pajak: DEFAULT_TAX,
  target_margin: 0.15,
  admin_akses_keuangan: true,
};

/** Menggabungkan baris tabel `settings` (key → jsonb) dengan default. */
export function mergeSettings(rows: { key: string; value: unknown }[] | null | undefined): AppSettings {
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  const obj = <T extends object>(key: string, def: T): T => {
    const v = map.get(key);
    return v && typeof v === "object" ? { ...def, ...(v as Partial<T>) } : def;
  };
  const num = (key: string, def: number) => {
    const v = map.get(key);
    return typeof v === "number" ? v : def;
  };
  const bool = (key: string, def: boolean) => {
    const v = map.get(key);
    return typeof v === "boolean" ? v : def;
  };
  return {
    lembur: obj("lembur", DEFAULT_OVERTIME),
    pph21: obj("pph21", DEFAULT_PPH21),
    bpjs: obj("bpjs", DEFAULT_BPJS),
    payroll: obj("payroll", DEFAULT_PAYROLL),
    pajak: obj("pajak", DEFAULT_TAX),
    target_margin: num("target_margin", DEFAULT_SETTINGS.target_margin),
    admin_akses_keuangan: bool("admin_akses_keuangan", DEFAULT_SETTINGS.admin_akses_keuangan),
  };
}
