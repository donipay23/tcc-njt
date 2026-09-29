import { dayOfWeek, round2, upahLembur, upahPerJam, type KomponenUpah, type TipeHari } from "./overtime";
import type { AppSettings } from "./settings";

export type BasisGaji = "bulanan" | "harian";

export interface Tunjangan {
  nama: string;
  jenis: "tetap" | "tidak_tetap";
  /** bulanan = nominal per bulan; harian = nominal per hari hadir. */
  basis: "bulanan" | "harian";
  jumlah: number;
}

export interface HariTimesheet {
  tanggal: string;
  status_kehadiran: string; // hadir | sakit | izin | alpa | cuti | libur
  tipe_hari: TipeHari;
  jam_aktual: number;
  jam_normal: number;
  jam_lembur: number;
  jam_konversi: number;
}

/** Rekap jam per karyawan per periode (hasil RPC `rekap_timesheet` atau `rekapDariHari`). */
export interface RekapJam {
  hari_hadir: number;
  hari_hadir_kerja: number;
  jam_aktual: number;
  jam_normal: number;
  jam_lembur: number;
  jam_konversi: number;
}

export function rekapDariHari(hari: HariTimesheet[]): RekapJam {
  const hadir = hari.filter((h) => h.status_kehadiran === "hadir" && h.jam_aktual > 0);
  const sum = (k: keyof HariTimesheet) => round2(hari.reduce((a, h) => a + (Number(h[k]) || 0), 0));
  return {
    hari_hadir: hadir.length,
    hari_hadir_kerja: hadir.filter((h) => h.tipe_hari === "kerja").length,
    jam_aktual: sum("jam_aktual"),
    jam_normal: sum("jam_normal"),
    jam_lembur: sum("jam_lembur"),
    jam_konversi: sum("jam_konversi"),
  };
}

export interface PayrollInput {
  periode: { mulai: string; selesai: string };
  karyawan: { tanggal_masuk: string; tanggal_keluar?: string | null };
  gaji_pokok: number;
  basis_gaji: BasisGaji;
  tunjangan: Tunjangan[];
  rekap: RekapJam;
  pph21?: number;
  potongan_lain?: number;
}

/** Jumlah hari kerja standar per bulan untuk konversi upah harian → bulanan (pola 5 hari). */
export const HARI_KERJA_STANDAR = 21;

const rp = (n: number) => Math.round(n);

function eachDate(mulai: string, selesai: string): string[] {
  const out: string[] = [];
  const [y, m, d] = mulai.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  while (true) {
    const s = dt.toISOString().slice(0, 10);
    if (s > selesai) break;
    out.push(s);
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return out;
}

/** Faktor prorata gaji bulanan (0..1) berdasarkan tanggal masuk/keluar dalam periode. */
export function faktorProrata(input: Pick<PayrollInput, "periode" | "karyawan">, s: AppSettings): number {
  const { mulai, selesai } = input.periode;
  const aktifMulai = input.karyawan.tanggal_masuk > mulai ? input.karyawan.tanggal_masuk : mulai;
  const keluar = input.karyawan.tanggal_keluar;
  const aktifSelesai = keluar && keluar < selesai ? keluar : selesai;
  if (aktifMulai > aktifSelesai) return 0;
  if (aktifMulai === mulai && aktifSelesai === selesai) return 1;
  if (s.payroll.prorata_metode === "kalender_30") {
    return Math.min(30, eachDate(aktifMulai, aktifSelesai).length) / 30;
  }
  const kerja = (from: string, to: string) =>
    eachDate(from, to).filter((t) => s.lembur.hari_kerja.includes(dayOfWeek(t))).length;
  const pembagi = s.payroll.prorata_pembagi_hari_kerja ?? kerja(mulai, selesai);
  return pembagi > 0 ? Math.min(1, kerja(aktifMulai, aktifSelesai) / pembagi) : 0;
}

export interface PayrollResult {
  hari_hadir: number;
  jam_aktual: number;
  jam_normal: number;
  jam_lembur: number;
  jam_konversi: number;
  faktor_prorata: number;
  gaji_pokok: number;
  tunjangan_tetap: number;
  tunjangan_tidak_tetap: number;
  dasar_upah_lembur: number;
  upah_per_jam: number;
  upah_lembur: number;
  bruto: number;
  bpjs_perusahaan: { kes: number; jkk: number; jkm: number; jht: number; jp: number; total: number };
  bpjs_karyawan: { kes: number; jht: number; jp: number; total: number };
  thr_cadangan: number;
  kompensasi_cadangan: number;
  pph21: number;
  potongan_lain: number;
  take_home_pay: number;
  biaya_perusahaan: number;
}

export function hitungPayroll(input: PayrollInput, s: AppSettings): PayrollResult {
  const { hari_hadir, hari_hadir_kerja: hadirHariKerja } = input.rekap;
  const jam_konversi = round2(Number(input.rekap.jam_konversi));

  const ttBulanan = input.tunjangan.filter((t) => t.jenis === "tetap" && t.basis === "bulanan").reduce((a, t) => a + t.jumlah, 0);
  const ttHarian = input.tunjangan.filter((t) => t.jenis === "tetap" && t.basis === "harian").reduce((a, t) => a + t.jumlah, 0);
  const tttBulanan = input.tunjangan.filter((t) => t.jenis === "tidak_tetap" && t.basis === "bulanan").reduce((a, t) => a + t.jumlah, 0);
  const tttHarian = input.tunjangan.filter((t) => t.jenis === "tidak_tetap" && t.basis === "harian").reduce((a, t) => a + t.jumlah, 0);

  // Upah bulanan "penuh" (dasar lembur, BPJS, THR)
  const gpBulanan = input.basis_gaji === "harian" ? input.gaji_pokok * HARI_KERJA_STANDAR : input.gaji_pokok;
  const komponen: KomponenUpah = {
    gaji_pokok: gpBulanan,
    tunjangan_tetap: ttBulanan + ttHarian * HARI_KERJA_STANDAR,
    tunjangan_tidak_tetap: tttBulanan + tttHarian * HARI_KERJA_STANDAR,
  };

  const faktor = input.basis_gaji === "harian" ? 1 : faktorProrata(input, s);
  // Upah harian dibayar per hari hadir di hari kerja; hari libur dibayar lewat lembur

  const gaji_pokok = rp(input.basis_gaji === "harian" ? input.gaji_pokok * hadirHariKerja : input.gaji_pokok * faktor);
  const tunjangan_tetap = rp(ttBulanan * faktor + ttHarian * hari_hadir);
  const tunjangan_tidak_tetap = rp(tttBulanan * faktor + tttHarian * hari_hadir);

  const perJam = upahPerJam(komponen, s.lembur);
  const upah_lembur = upahLembur(jam_konversi, komponen, s.lembur);
  const bruto = gaji_pokok + tunjangan_tetap + tunjangan_tidak_tetap + upah_lembur;

  // BPJS: dasar = upah tetap (GP + TT). Untuk upah harian memakai upah yang diterima periode ini.
  const aktif = faktor > 0 || hari_hadir > 0;
  const dasarBpjs = !aktif ? 0 : input.basis_gaji === "harian" ? gaji_pokok + tunjangan_tetap : komponen.gaji_pokok + komponen.tunjangan_tetap;
  const b = s.bpjs;
  const dasarKes = Math.min(dasarBpjs, b.kes_batas_upah);
  const dasarJp = Math.min(dasarBpjs, b.jp_batas_upah);
  const bp = {
    kes: rp(dasarKes * b.kes_perusahaan),
    jkk: rp(dasarBpjs * b.jkk),
    jkm: rp(dasarBpjs * b.jkm),
    jht: rp(dasarBpjs * b.jht_perusahaan),
    jp: rp(dasarJp * b.jp_perusahaan),
    total: 0,
  };
  bp.total = bp.kes + bp.jkk + bp.jkm + bp.jht + bp.jp;
  const bk = { kes: rp(dasarKes * b.kes_karyawan), jht: rp(dasarBpjs * b.jht_karyawan), jp: rp(dasarJp * b.jp_karyawan), total: 0 };
  bk.total = bk.kes + bk.jht + bk.jp;

  // Cadangan THR & kompensasi PKWT: 1/12 upah (GP + TT) per bulan, prorata
  const upahTetapPeriode = input.basis_gaji === "harian" ? gaji_pokok + tunjangan_tetap : (komponen.gaji_pokok + komponen.tunjangan_tetap) * faktor;
  const thr_cadangan = s.payroll.thr_cadangan ? rp(upahTetapPeriode / 12) : 0;
  const kompensasi_cadangan = s.payroll.kompensasi_pkwt_cadangan ? rp(upahTetapPeriode / 12) : 0;

  const pph21 = s.payroll.pph21_mode === "tidak_dihitung" ? 0 : rp(input.pph21 ?? 0);
  const potongan_lain = rp(input.potongan_lain ?? 0);

  const take_home_pay = bruto - bk.total - (s.payroll.pph21_mode === "dipotong_karyawan" ? pph21 : 0) - potongan_lain;
  const biaya_perusahaan =
    bruto + bp.total + thr_cadangan + kompensasi_cadangan + (s.payroll.pph21_mode === "ditanggung_perusahaan" ? pph21 : 0);

  return {
    hari_hadir,
    jam_aktual: round2(Number(input.rekap.jam_aktual)),
    jam_normal: round2(Number(input.rekap.jam_normal)),
    jam_lembur: round2(Number(input.rekap.jam_lembur)),
    jam_konversi,
    faktor_prorata: round2(faktor),
    gaji_pokok,
    tunjangan_tetap,
    tunjangan_tidak_tetap,
    dasar_upah_lembur: rp(perJam * s.lembur.pembagi_upah_jam),
    upah_per_jam: round2(perJam),
    upah_lembur,
    bruto,
    bpjs_perusahaan: bp,
    bpjs_karyawan: bk,
    thr_cadangan,
    kompensasi_cadangan,
    pph21,
    potongan_lain,
    take_home_pay,
    biaya_perusahaan,
  };
}
