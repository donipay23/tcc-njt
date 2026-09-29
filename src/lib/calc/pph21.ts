/**
 * PPh Pasal 21 pegawai – PP 58/2023 & PMK 168/2023.
 *
 * - Masa Januari s/d November (dan pegawai tidak tetap): Tarif Efektif Rata-rata (TER) bulanan
 *   × penghasilan bruto sebulan.
 * - Masa pajak terakhir (Desember, atau bulan terakhir bekerja): PPh setahun dengan tarif Pasal 17
 *   atas PKP, dikurangi PPh yang sudah dipotong pada masa sebelumnya (bisa lebih bayar).
 *
 * Tabel & parameter di bawah adalah default; dapat ditimpa lewat baris `settings` key `pph21`.
 */

import type { Pph21Settings } from "./settings";

export type KategoriTER = "A" | "B" | "C";
/** [batas atas penghasilan bruto sebulan (inklusif), tarif %]; batas `null` = tak terbatas. */
export type TabelTER = [number | null, number][];

export const TER_A: TabelTER = [
  [5_400_000, 0], [5_650_000, 0.25], [5_950_000, 0.5], [6_300_000, 0.75], [6_750_000, 1], [7_500_000, 1.25],
  [8_550_000, 1.5], [9_650_000, 1.75], [10_050_000, 2], [10_350_000, 2.25], [10_700_000, 2.5], [11_050_000, 3],
  [11_600_000, 3.5], [12_500_000, 4], [13_750_000, 5], [15_100_000, 6], [16_950_000, 7], [19_750_000, 8],
  [24_150_000, 9], [26_450_000, 10], [28_000_000, 11], [30_050_000, 12], [32_400_000, 13], [35_400_000, 14],
  [39_100_000, 15], [43_850_000, 16], [47_800_000, 17], [51_400_000, 18], [56_300_000, 19], [62_200_000, 20],
  [68_600_000, 21], [77_500_000, 22], [89_000_000, 23], [103_000_000, 24], [125_000_000, 25], [157_000_000, 26],
  [206_000_000, 27], [337_000_000, 28], [454_000_000, 29], [550_000_000, 30], [695_000_000, 31], [910_000_000, 32],
  [1_400_000_000, 33], [null, 34],
];

export const TER_B: TabelTER = [
  [6_200_000, 0], [6_500_000, 0.25], [6_850_000, 0.5], [7_300_000, 0.75], [9_200_000, 1], [10_750_000, 1.5],
  [11_250_000, 2], [11_600_000, 2.5], [12_600_000, 3], [13_600_000, 4], [14_950_000, 5], [16_400_000, 6],
  [18_450_000, 7], [21_850_000, 8], [26_000_000, 9], [27_700_000, 10], [29_350_000, 11], [31_450_000, 12],
  [33_950_000, 13], [37_100_000, 14], [41_100_000, 15], [45_800_000, 16], [49_500_000, 17], [53_800_000, 18],
  [58_500_000, 19], [64_000_000, 20], [71_000_000, 21], [80_000_000, 22], [93_000_000, 23], [109_000_000, 24],
  [129_000_000, 25], [163_000_000, 26], [211_000_000, 27], [374_000_000, 28], [459_000_000, 29], [555_000_000, 30],
  [704_000_000, 31], [957_000_000, 32], [1_405_000_000, 33], [null, 34],
];

export const TER_C: TabelTER = [
  [6_600_000, 0], [6_950_000, 0.25], [7_350_000, 0.5], [7_800_000, 0.75], [8_850_000, 1], [9_800_000, 1.25],
  [10_950_000, 1.5], [11_200_000, 1.75], [12_050_000, 2], [12_950_000, 3], [14_150_000, 4], [15_550_000, 5],
  [17_050_000, 6], [19_500_000, 7], [22_700_000, 8], [26_600_000, 9], [28_100_000, 10], [30_100_000, 11],
  [32_600_000, 12], [35_400_000, 13], [38_900_000, 14], [43_000_000, 15], [47_400_000, 16], [51_200_000, 17],
  [55_800_000, 18], [60_400_000, 19], [66_700_000, 20], [74_500_000, 21], [83_200_000, 22], [95_600_000, 23],
  [110_000_000, 24], [134_000_000, 25], [169_000_000, 26], [221_000_000, 27], [390_000_000, 28], [463_000_000, 29],
  [561_000_000, 30], [709_000_000, 31], [965_000_000, 32], [1_419_000_000, 33], [null, 34],
];

/** Lapisan tarif Pasal 17 ayat (1) huruf a (UU HPP). */
export const PASAL17: TabelTER = [
  [60_000_000, 5], [250_000_000, 15], [500_000_000, 25], [5_000_000_000, 30], [null, 35],
];

export interface StatusPtkp {
  kawin: boolean;
  tanggungan: number; // 0..3
  kode: string; // "TK/0", "K/1", …
}

/** "K/2", "k-2", "TK0", kosong → default TK/0. Tanggungan dibatasi 3. */
export function parsePtkp(v: string | null | undefined): StatusPtkp {
  const m = String(v ?? "").toUpperCase().replace(/\s/g, "").match(/^(TK|K)[/\-_]?(\d)?$/);
  const kawin = m?.[1] === "K";
  const tanggungan = Math.min(3, Number(m?.[2] ?? 0));
  return { kawin, tanggungan, kode: `${kawin ? "K" : "TK"}/${tanggungan}` };
}

/** A: TK/0, TK/1, K/0 · B: TK/2, TK/3, K/1, K/2 · C: K/3 */
export function kategoriTER(p: StatusPtkp): KategoriTER {
  const n = p.tanggungan + (p.kawin ? 1 : 0);
  if (n <= 1) return "A";
  if (n <= 3) return "B";
  return "C";
}

export function tarifTER(bruto: number, kategori: KategoriTER, s: Pph21Settings): number {
  const tabel = s.ter[kategori];
  for (const [batas, tarif] of tabel) if (batas == null || bruto <= batas) return tarif / 100;
  return tabel[tabel.length - 1][1] / 100;
}

/** PPh Pasal 17 progresif atas PKP (dibulatkan ke bawah ribuan sebelum dihitung). */
export function pajakPasal17(pkp: number, s: Pph21Settings): number {
  let sisa = Math.max(0, Math.floor(pkp / 1000) * 1000);
  let bawah = 0;
  let pajak = 0;
  for (const [batas, tarif] of s.pasal17) {
    if (sisa <= 0) break;
    const lebar = batas == null ? sisa : Math.min(sisa, batas - bawah);
    pajak += (lebar * tarif) / 100;
    sisa -= lebar;
    if (batas != null) bawah = batas;
  }
  return Math.floor(pajak);
}

export function nilaiPtkp(p: StatusPtkp, s: Pph21Settings): number {
  return s.ptkp_dasar + (p.kawin ? s.ptkp_kawin : 0) + p.tanggungan * s.ptkp_tanggungan;
}

export interface Pph21Input {
  /** Penghasilan bruto masa ini (gaji, tunjangan, lembur, premi JKK/JKM/BPJS Kes dibayar pemberi kerja). */
  bruto: number;
  /** Iuran JHT + JP yang dibayar pegawai masa ini (pengurang pada perhitungan setahun). */
  iuran_pegawai: number;
  status_ptkp: string | null | undefined;
  /** PKWT/pegawai tetap → TER + perhitungan setahun di masa terakhir. Harian → TER saja. */
  pegawai_tetap: boolean;
  /** Masa Desember atau bulan terakhir bekerja. */
  masa_terakhir: boolean;
  /** Akumulasi masa-masa sebelumnya dalam tahun pajak yang sama. */
  sebelumnya?: { bruto: number; iuran_pegawai: number; pph21: number; bulan: number };
}

export interface Pph21Result {
  metode: "TER" | "Pasal 17 setahun" | "nihil";
  kategori: KategoriTER;
  status_ptkp: string;
  tarif_ter: number | null;
  pph21: number;
  /** Rincian perhitungan setahun (masa terakhir). */
  setahun?: {
    bruto: number;
    biaya_jabatan: number;
    iuran_pegawai: number;
    neto: number;
    ptkp: number;
    pkp: number;
    pph_setahun: number;
    sudah_dipotong: number;
  };
}

export function hitungPph21(i: Pph21Input, s: Pph21Settings): Pph21Result {
  const p = parsePtkp(i.status_ptkp);
  const kategori = kategoriTER(p);
  const bruto = Math.max(0, Math.round(i.bruto));
  if (!(i.pegawai_tetap && i.masa_terakhir)) {
    const tarif = tarifTER(bruto, kategori, s);
    const pph21 = Math.floor(bruto * tarif);
    return { metode: pph21 ? "TER" : "nihil", kategori, status_ptkp: p.kode, tarif_ter: tarif, pph21 };
  }
  const prev = i.sebelumnya ?? { bruto: 0, iuran_pegawai: 0, pph21: 0, bulan: 0 };
  const bulan = prev.bulan + 1;
  const brutoSetahun = prev.bruto + bruto;
  const biaya_jabatan = Math.min(Math.round(brutoSetahun * s.biaya_jabatan_persen), s.biaya_jabatan_maks_bulan * bulan);
  const iuran = prev.iuran_pegawai + i.iuran_pegawai;
  const neto = brutoSetahun - biaya_jabatan - iuran;
  const ptkp = nilaiPtkp(p, s);
  const pkp = Math.max(0, Math.floor((neto - ptkp) / 1000) * 1000);
  const pph_setahun = pajakPasal17(pkp, s);
  const pph21 = pph_setahun - prev.pph21; // negatif = lebih potong, dikembalikan ke pegawai
  return {
    metode: "Pasal 17 setahun",
    kategori,
    status_ptkp: p.kode,
    tarif_ter: null,
    pph21,
    setahun: { bruto: brutoSetahun, biaya_jabatan, iuran_pegawai: iuran, neto, ptkp, pkp, pph_setahun, sudah_dipotong: prev.pph21 },
  };
}

/**
 * Gross-up: perusahaan memberi tunjangan PPh sebesar PPh itu sendiri, sehingga pajak
 * tidak mengurangi gaji bersih. Dicari titik tetap tunjangan = PPh(bruto + tunjangan).
 */
export function hitungPph21GrossUp(i: Pph21Input, s: Pph21Settings): Pph21Result & { tunjangan_pph: number } {
  let t = 0;
  let r = hitungPph21(i, s);
  for (let k = 0; k < 60; k++) {
    r = hitungPph21({ ...i, bruto: i.bruto + t }, s);
    if (r.pph21 <= t) break;
    t = r.pph21;
  }
  // Pada batas lapisan TER, titik tetap bisa tidak ada: pakai tunjangan ≥ PPh (tidak ada kurang potong)
  return { ...r, tunjangan_pph: Math.max(t, r.pph21) };
}
