import { round2 } from "./overtime";
import type { TaxSettings } from "./settings";

export interface RateHistori {
  classification_id: string;
  rate_per_jam: number;
  berlaku_mulai: string; // YYYY-MM-DD
}

/** Rate yang berlaku pada tanggal kerja: rate dengan `berlaku_mulai` terbaru yang <= tanggal. */
export function rateBerlaku(rates: RateHistori[], classificationId: string, tanggal: string): number | null {
  let best: RateHistori | null = null;
  for (const r of rates) {
    if (r.classification_id !== classificationId || r.berlaku_mulai > tanggal) continue;
    if (!best || r.berlaku_mulai > best.berlaku_mulai) best = r;
  }
  return best ? Number(best.rate_per_jam) : null;
}

export interface TimesheetTagihan {
  employee_id: string;
  classification_id: string;
  tanggal: string;
  jam_aktual: number; // jam normal + jam lembur aktual (tanpa pengali)
}

export interface InvoiceLine {
  employee_id: string;
  classification_id: string;
  rate_per_jam: number;
  jam_aktual: number;
  jumlah: number;
}

/**
 * Baris tagihan man-hour: Σ (jam aktual × rate klasifikasi yang berlaku di tanggal kerja).
 * Dikelompokkan per karyawan + klasifikasi + rate (rate bisa berubah di tengah periode).
 */
export function susunBarisTagihan(ts: TimesheetTagihan[], rates: RateHistori[]) {
  const lines = new Map<string, InvoiceLine>();
  const tanpaRate: TimesheetTagihan[] = [];
  for (const t of ts) {
    if (!t.jam_aktual) continue;
    const rate = rateBerlaku(rates, t.classification_id, t.tanggal);
    if (rate == null) {
      tanpaRate.push(t);
      continue;
    }
    const key = `${t.employee_id}|${t.classification_id}|${rate}`;
    const l = lines.get(key) ?? { employee_id: t.employee_id, classification_id: t.classification_id, rate_per_jam: rate, jam_aktual: 0, jumlah: 0 };
    l.jam_aktual = round2(l.jam_aktual + Number(t.jam_aktual));
    lines.set(key, l);
  }
  const out = [...lines.values()].map((l) => ({ ...l, jumlah: Math.round(l.jam_aktual * l.rate_per_jam) }));
  return { lines: out, tanpaRate };
}

export interface InvoiceTotals {
  subtotal: number;
  dpp_ppn: number;
  ppn: number;
  pph23: number;
  total_tagihan: number; // subtotal + PPN
  estimasi_diterima: number; // total − PPh 23 dipotong klien
}

export function hitungPajakInvoice(subtotal: number, t: TaxSettings): InvoiceTotals {
  const dpp_ppn = Math.round(subtotal * t.ppn_dpp_faktor);
  const ppn = Math.round(dpp_ppn * t.ppn_tarif);
  const pph23 = Math.round(subtotal * t.pph23_tarif);
  const total_tagihan = subtotal + ppn;
  return { subtotal, dpp_ppn, ppn, pph23, total_tagihan, estimasi_diterima: total_tagihan - pph23 };
}

export type AgingBucket = "0-30" | "31-60" | "61-90" | ">90";

/** Umur piutang dihitung dari tanggal invoice sampai hari ini. */
export function agingBucket(tanggalInvoice: string, hariIni: string): AgingBucket {
  const ms = Date.parse(hariIni + "T00:00:00Z") - Date.parse(tanggalInvoice + "T00:00:00Z");
  const hari = Math.floor(ms / 86_400_000);
  if (hari <= 30) return "0-30";
  if (hari <= 60) return "31-60";
  if (hari <= 90) return "61-90";
  return ">90";
}

export function margin(pendapatan: number, biaya: number) {
  const profit = pendapatan - biaya;
  return { profit, persen: pendapatan ? round2((profit / pendapatan) * 100) : 0 };
}
