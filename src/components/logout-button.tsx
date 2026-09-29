"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { listQueue, offlineSupported } from "@/lib/offline-queue";

/** Keluar: peringatkan bila masih ada absensi offline, lalu hapus halaman yang di-cache di perangkat. */
export function LogoutButton({ userId, action }: { userId: string; action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  const keluar = async () => {
    if (offlineSupported()) {
      const n = (await listQueue(userId).catch(() => [])).length;
      if (n && !window.confirm(`${n} absensi offline belum tersinkron. Data tetap tersimpan di HP ini dan akan dikirim saat Anda login lagi. Tetap keluar?`)) return;
    }
    if ("caches" in window) await caches.delete("mps-pages").catch(() => false);
    start(() => action());
  };
  return (
    <button type="button" onClick={keluar} disabled={pending} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Keluar" aria-label="Keluar">
      <LogOut size={18} />
    </button>
  );
}
