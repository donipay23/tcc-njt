import type { BreakWindow, OvertimeSettings, Tier } from "./settings";

export type TipeHari = "kerja" | "libur";

export interface DayHours {
  tipe_hari: TipeHari;
  /** Jam kerja aktual setelah dikurangi istirahat (dasar tagihan ke klien). */
  jam_aktual: number;
  jam_normal: number;
  /** Jam lembur aktual (tanpa pengali). Pada hari libur = seluruh jam aktual. */
  jam_lembur: number;
  /** Jam lembur setelah dikali pengali (dasar upah lembur). */
  jam_konversi: number;
  peringatan: string[];
}

/** Pembulatan ke 2 desimal untuk jam agar tidak ada sisa floating-point. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Menit sejak 00:00 dari "HH:MM" atau "HH:MM:SS". */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Hari dalam minggu (0 = Minggu) dari tanggal "YYYY-MM-DD", bebas zona waktu. */
export function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function tipeHari(isoDate: string, liburNasional: Set<string> | string[], hariKerja: number[]): TipeHari {
  const set = liburNasional instanceof Set ? liburNasional : new Set(liburNasional);
  if (set.has(isoDate)) return "libur";
  return hariKerja.includes(dayOfWeek(isoDate)) ? "kerja" : "libur";
}

/**
 * Jam kerja bersih (jam) antara masuk & keluar, dikurangi overlap dengan jam istirahat.
 * Jika keluar <= masuk dianggap lewat tengah malam (shift malam).
 */
export function jamKerjaBersih(masuk: string, keluar: string, istirahat: BreakWindow[]): number {
  const start = toMinutes(masuk);
  let end = toMinutes(keluar);
  if (end <= start) end += 24 * 60;
  let menit = end - start;
  for (const b of istirahat) {
    const bs = toMinutes(b.mulai);
    const be = toMinutes(b.selesai);
    // cek jendela istirahat pada hari yang sama dan hari berikutnya (shift malam)
    for (const offset of [0, 24 * 60]) {
      const overlap = Math.min(end, be + offset) - Math.max(start, bs + offset);
      if (overlap > 0) menit -= overlap;
    }
  }
  return round2(Math.max(0, menit) / 60);
}

/**
 * Menjumlahkan jam × pengali secara bertingkat. Mendukung jam pecahan:
 * mis. 1,5 jam lembur hari kerja = 1 × 1,5 + 0,5 × 2.
 */
export function applyTiers(jam: number, tiers: Tier[]): number {
  let sisa = jam;
  let batasSebelumnya = 0;
  let total = 0;
  for (const t of tiers) {
    if (sisa <= 0) break;
    const kapasitas = t.sampai == null ? Infinity : t.sampai - batasSebelumnya;
    const dipakai = Math.min(sisa, kapasitas);
    total += dipakai * t.pengali;
    sisa -= dipakai;
    if (t.sampai != null) batasSebelumnya = t.sampai;
  }
  // jika tier terakhir punya batas dan masih ada sisa, pakai pengali terakhir
  if (sisa > 0 && tiers.length) total += sisa * tiers[tiers.length - 1].pengali;
  return round2(total);
}

export interface DayInput {
  tanggal: string; // YYYY-MM-DD
  jam_masuk?: string | null;
  jam_keluar?: string | null;
}

/** Memisahkan jam normal, lembur aktual dan jam konversi untuk satu hari. */
export function hitungJamHarian(
  input: DayInput,
  s: OvertimeSettings,
  liburNasional: Set<string> | string[] = [],
): DayHours {
  const tipe = tipeHari(input.tanggal, liburNasional, s.hari_kerja);
  const peringatan: string[] = [];
  if (!input.jam_masuk || !input.jam_keluar) {
    if (input.jam_masuk || input.jam_keluar) peringatan.push("Jam masuk/keluar tidak lengkap");
    return { tipe_hari: tipe, jam_aktual: 0, jam_normal: 0, jam_lembur: 0, jam_konversi: 0, peringatan };
  }
  const aktual = jamKerjaBersih(input.jam_masuk, input.jam_keluar, s.jam_istirahat);
  let normal: number, lembur: number, konversi: number;
  if (tipe === "kerja") {
    normal = Math.min(aktual, s.jam_normal_harian);
    lembur = round2(Math.max(0, aktual - s.jam_normal_harian));
    konversi = applyTiers(lembur, s.pengali_hari_kerja);
    if (lembur > s.batas_lembur_harian)
      peringatan.push(`Lembur ${lembur} jam melebihi batas ${s.batas_lembur_harian} jam/hari`);
  } else {
    normal = 0;
    lembur = aktual;
    konversi = applyTiers(aktual, s.pengali_hari_libur);
  }
  if (aktual > s.batas_jam_kerja_harian)
    peringatan.push(`Jam kerja ${aktual} jam melebihi ${s.batas_jam_kerja_harian} jam/hari`);
  return { tipe_hari: tipe, jam_aktual: aktual, jam_normal: round2(normal), jam_lembur: lembur, jam_konversi: konversi, peringatan };
}

export interface KomponenUpah {
  gaji_pokok: number;
  tunjangan_tetap: number; // total bulanan
  tunjangan_tidak_tetap: number; // total (estimasi) bulanan
}

/**
 * Dasar upah sebulan untuk lembur:
 * - default: gaji pokok + tunjangan tetap;
 * - jika ada tunjangan tidak tetap dan (GP + TT) < 75% total upah → 75% total upah.
 */
export function dasarUpahLembur(u: KomponenUpah, s: Pick<OvertimeSettings, "rasio_upah_tetap_minimum">) {
  const tetap = u.gaji_pokok + u.tunjangan_tetap;
  const total = tetap + u.tunjangan_tidak_tetap;
  if (u.tunjangan_tidak_tetap > 0 && tetap < s.rasio_upah_tetap_minimum * total) {
    return { dasar: s.rasio_upah_tetap_minimum * total, metode: "75% total upah" as const };
  }
  return { dasar: tetap, metode: "gaji pokok + tunjangan tetap" as const };
}

export function upahPerJam(u: KomponenUpah, s: OvertimeSettings): number {
  return dasarUpahLembur(u, s).dasar / s.pembagi_upah_jam;
}

/** Upah lembur (Rp, dibulatkan ke rupiah terdekat) = jam konversi × upah per jam. */
export function upahLembur(jamKonversi: number, u: KomponenUpah, s: OvertimeSettings): number {
  return Math.round(jamKonversi * upahPerJam(u, s));
}

/** Senin (YYYY-MM-DD) dari minggu tanggal tersebut — minggu Senin s/d Minggu. */
export function awalMinggu(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

/**
 * Cek batas lembur mingguan (hanya lembur di hari kerja) — mengembalikan daftar minggu
 * (tanggal Senin) yang melebihi batas beserta totalnya.
 */
export function cekBatasMingguan(
  hari: { tanggal: string; tipe_hari: TipeHari; jam_lembur: number }[],
  s: Pick<OvertimeSettings, "batas_lembur_mingguan">,
) {
  const perMinggu = new Map<string, number>();
  for (const h of hari) {
    if (h.tipe_hari !== "kerja") continue;
    const k = awalMinggu(h.tanggal);
    perMinggu.set(k, (perMinggu.get(k) ?? 0) + h.jam_lembur);
  }
  return [...perMinggu.entries()]
    .filter(([, total]) => total > s.batas_lembur_mingguan)
    .map(([minggu, total]) => ({ minggu, total: round2(total) }));
}
