import { akhirBulan, hariIni, tambahBulan, tambahHari } from "./format";

/**
 * Periode cut-off yang memuat tanggal tertentu. `tanggalMulai` = 1 → 1 s/d akhir bulan;
 * 21 → tanggal 21 s/d 20 bulan berikutnya.
 */
export function periodeCutoff(tanggalMulai: number, pada: string = hariIni()) {
  if (tanggalMulai <= 1) {
    const mulai = pada.slice(0, 8) + "01";
    return { mulai, selesai: akhirBulan(pada) };
  }
  const hari = Number(pada.slice(8, 10));
  const dd = String(tanggalMulai).padStart(2, "0");
  const bulanIni = pada.slice(0, 8) + dd;
  const mulai = hari >= tanggalMulai ? bulanIni : tambahBulan(bulanIni, -1);
  const selesai = tambahHari(tambahBulan(mulai, 1), -1);
  return { mulai, selesai };
}

/** Membaca rentang dari searchParams (?mulai=&selesai=) dengan default periode berjalan. */
export function rentangDariParams(sp: Record<string, string | string[] | undefined>, tanggalMulai = 1) {
  const def = periodeCutoff(tanggalMulai);
  const s = (k: string) => (typeof sp[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp[k] as string) ? (sp[k] as string) : undefined);
  return { mulai: s("mulai") ?? def.mulai, selesai: s("selesai") ?? def.selesai };
}
