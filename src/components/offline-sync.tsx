"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { QUEUE_EVENT, listQueue, offlineSupported } from "@/lib/offline-queue";
import { syncQueue } from "@/lib/offline-sync";

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  return online;
}

/** Indikator di header: status koneksi + jumlah absensi yang menunggu sinkron. Sinkron otomatis. */
export function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!offlineSupported()) return;
    setPending((await listQueue(userId)).length);
  }, [userId]);

  const sync = useCallback(async () => {
    if (!offlineSupported() || !navigator.onLine) return;
    if (!(await listQueue(userId)).length) return;
    setBusy(true);
    try {
      const r = await syncQueue(userId);
      const parts = [];
      if (r.terkirim) parts.push(`${r.terkirim} absensi offline tersinkron`);
      if (r.dilewati) parts.push(`${r.dilewati} dilewati karena sudah di-approve`);
      if (r.gagal) parts.push(`${r.gagal} belum terkirim${r.pesan ? ` (${r.pesan})` : ""}`);
      if (parts.length) setInfo(parts.join(" · "));
      if (r.terkirim) router.refresh();
    } finally {
      setBusy(false);
      refresh();
    }
  }, [userId, refresh, router]);

  useEffect(() => {
    refresh();
    sync();
    const onQueue = () => refresh();
    window.addEventListener(QUEUE_EVENT, onQueue);
    window.addEventListener("online", sync);
    const t = setInterval(sync, 60_000);
    return () => {
      window.removeEventListener(QUEUE_EVENT, onQueue);
      window.removeEventListener("online", sync);
      clearInterval(t);
    };
  }, [refresh, sync]);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 8000);
    return () => clearTimeout(t);
  }, [info]);

  if (online && !pending && !info) return null;
  return (
    <div className="relative flex items-center">
      {!online ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-gray-800 px-2 py-1 text-xs font-medium text-white">
          <CloudOff size={14} /> {pending ? `${pending} antre` : "Offline"}
        </span>
      ) : pending ? (
        <button type="button" onClick={sync} disabled={busy} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {pending} menunggu sinkron
        </button>
      ) : null}
      {info && (
        <div role="status" className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700 shadow-lg">
          {info}
        </div>
      )}
    </div>
  );
}
