"use client";

import { simpanAbsensi } from "@/app/(app)/absensi/actions";
import { listQueue, removeKeys } from "./offline-queue";

export interface SyncResult {
  terkirim: number;
  dilewati: number; // sudah di-approve di server, input offline diabaikan
  gagal: number;
  pesan?: string;
}

let running: Promise<SyncResult> | null = null;

/** Kirim antrean offline per tanggal (urut waktu input). Aman dipanggil berulang. */
export function syncQueue(userId: string): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const res: SyncResult = { terkirim: 0, dilewati: 0, gagal: 0 };
    const queue = await listQueue(userId);
    const perTanggal = new Map<string, typeof queue>();
    for (const q of queue) perTanggal.set(q.tanggal, [...(perTanggal.get(q.tanggal) ?? []), q]);
    for (const [tanggal, entries] of perTanggal) {
      if (!navigator.onLine) {
        res.gagal += entries.length;
        continue;
      }
      try {
        const r = await simpanAbsensi(tanggal, entries.map((e) => ({ ...e.row, dicatat_pada: e.dicatat_pada })));
        if (r.error) {
          res.gagal += entries.length;
          res.pesan = r.error;
          continue;
        }
        res.terkirim += r.ok;
        res.dilewati += r.dilewati;
        await removeKeys(entries.map((e) => e.key));
      } catch {
        // jaringan putus / sesi habis: biarkan di antrean untuk dicoba lagi
        res.gagal += entries.length;
        res.pesan = "Belum bisa terhubung ke server atau sesi login berakhir.";
      }
    }
    return res;
  })().finally(() => {
    running = null;
  });
  return running;
}
