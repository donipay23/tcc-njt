"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CloudOff, Lock } from "lucide-react";
import { hitungJamHarian } from "@/lib/calc/overtime";
import type { OvertimeSettings } from "@/lib/calc/settings";
import { angka, hariIni, tambahHari, tanggal as fmtTanggal } from "@/lib/format";
import { STATUS_APPROVAL, STATUS_KEHADIRAN } from "@/lib/types";
import { QUEUE_EVENT, enqueue, listQueue, offlineSupported, removeKeys, type QueueEntry } from "@/lib/offline-queue";
import { useOnline } from "@/components/offline-sync";
import { simpanAbsensi, type AbsensiRow } from "../actions";

export interface Emp { id: string; nik: string; nama: string; status: string; klasifikasi: string }
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const trim = (t?: string | null) => (t ? t.slice(0, 5) : "");
const ISO = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
  userId: string;
  tanggal: string;
  regu: string;
  teams: { id: string; nama: string }[];
  /** Anggota semua regu milik user — ikut tersimpan di halaman cache agar bisa dipakai offline. */
  roster: Record<string, Emp[]>;
  /** Timesheet server untuk (tanggal, regu) di atas. */
  existing: Record<string, any>;
  lembur: OvertimeSettings;
  holidays: { tanggal: string; nama: string }[];
}

/**
 * Input absensi dengan dukungan offline: saat tidak ada sinyal, ganti tanggal/regu dilakukan
 * di perangkat dan data disimpan ke antrean IndexedDB, lalu dikirim otomatis saat online.
 */
export function InputAbsensi(props: Props) {
  const router = useRouter();
  const online = useOnline();
  const [view, setView] = useState({ tanggal: props.tanggal, regu: props.regu });
  const [pendingMap, setPendingMap] = useState<Record<string, QueueEntry> | null>(null);
  // Form baru dirender setelah tanggal/regu final diketahui (hindari kilasan data halaman cache)
  const [resolved, setResolved] = useState(false);

  // Halaman dibuka dari cache saat offline: ambil tanggal/regu dari URL (bukan dari saat halaman di-cache)
  useEffect(() => {
    setResolved(true);
    if (navigator.onLine) return;
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tanggal");
    const r = q.get("regu");
    setView({
      tanggal: t && ISO.test(t) ? t : hariIni(),
      regu: r && props.roster[r] ? r : props.regu,
    });
  }, [props.roster, props.regu]);

  const loadPending = useCallback(async () => {
    if (!offlineSupported()) return setPendingMap({});
    const q = await listQueue(props.userId).catch(() => []);
    setPendingMap(Object.fromEntries(q.filter((e) => e.tanggal === view.tanggal).map((e) => [e.row.employee_id, e])));
  }, [props.userId, view.tanggal]);

  useEffect(() => {
    if (!resolved) return;
    setPendingMap(null);
    loadPending();
  }, [loadPending, resolved]);

  useEffect(() => {
    // setelah sinkron di latar belakang, muat ulang data server
    const onQueue = () => loadPending();
    window.addEventListener(QUEUE_EVENT, onQueue);
    return () => window.removeEventListener(QUEUE_EVENT, onQueue);
  }, [loadPending]);

  const go = (patch: Partial<typeof view>) => {
    const next = { ...view, ...patch };
    const url = `/absensi/input?${new URLSearchParams(next)}`;
    if (navigator.onLine) router.push(url);
    else {
      setView(next);
      window.history.replaceState(null, "", url);
    }
  };

  const fromServer = view.tanggal === props.tanggal && view.regu === props.regu;
  const employees = props.roster[view.regu] ?? [];
  const existing = fromServer ? props.existing : {};
  const holidayDates = useMemo(() => props.holidays.map((h) => h.tanggal), [props.holidays]);

  return (
    <div className="space-y-3">
      {!online && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-300 bg-gray-800 px-3 py-2 text-sm text-white">
          <CloudOff size={18} className="mt-0.5 shrink-0" />
          <span>
            Mode offline. Data disimpan di HP ini dan dikirim otomatis saat sinyal kembali. Status approval dari server{" "}
            {fromServer ? "mungkin belum yang terbaru" : "tidak tersedia untuk tanggal ini"}.
          </span>
        </div>
      )}
      <div className="card grid grid-cols-2 gap-3 p-3 sm:grid-cols-2">
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Regu</span>
          <select value={view.regu} onChange={(e) => go({ regu: e.target.value })} className="input">
            {props.teams.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </label>
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Tanggal</span>
          <div className="flex gap-1">
            <button type="button" className="btn-secondary px-2" onClick={() => go({ tanggal: tambahHari(view.tanggal, -1) })}>‹</button>
            <input type="date" value={view.tanggal} onChange={(e) => e.target.value && go({ tanggal: e.target.value })} className="input" />
            <button type="button" className="btn-secondary px-2" onClick={() => go({ tanggal: tambahHari(view.tanggal, 1) })}>›</button>
          </div>
        </label>
      </div>
      {pendingMap == null ? (
        <div className="card p-6 text-center text-sm text-gray-500">Memuat…</div>
      ) : (
        <FormAbsensi
          key={`${view.regu}-${view.tanggal}`}
          userId={props.userId}
          tanggal={view.tanggal}
          employees={employees}
          existing={existing}
          pending={pendingMap}
          lembur={props.lembur}
          holidays={holidayDates}
          namaLibur={props.holidays.find((h) => h.tanggal === view.tanggal)?.nama ?? null}
          onSaved={() => (navigator.onLine ? router.refresh() : undefined)}
        />
      )}
    </div>
  );
}

function FormAbsensi({ userId, tanggal, employees, existing, pending, lembur, holidays, namaLibur, onSaved }: {
  userId: string;
  tanggal: string;
  employees: Emp[];
  existing: Record<string, any>;
  pending: Record<string, QueueEntry>;
  lembur: OvertimeSettings;
  holidays: string[];
  namaLibur: string | null;
  onSaved: () => void;
}) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string; offline?: boolean } | null>(null);
  const [masukAll, setMasukAll] = useState("07:00");
  const [keluarAll, setKeluarAll] = useState("16:00");
  const [queued, setQueued] = useState<Set<string>>(() => new Set(Object.keys(pending)));
  // antrean berubah (mis. baru tersinkron di latar belakang) → perbarui penanda
  useEffect(() => setQueued(new Set(Object.keys(pending))), [pending]);
  const [rows, setRows] = useState<Record<string, AbsensiRow & { dirty: boolean }>>(() =>
    Object.fromEntries(
      employees.map((e) => {
        const q = pending[e.id]?.row;
        const t = q ?? existing[e.id];
        return [
          e.id,
          {
            employee_id: e.id,
            status_kehadiran: t?.status_kehadiran ?? (e.status === "cuti" ? "cuti" : "hadir"),
            jam_masuk: trim(t?.jam_masuk) || (t ? "" : "07:00"),
            jam_keluar: trim(t?.jam_keluar) || (t ? "" : "16:00"),
            lokasi: t?.lokasi ?? "",
            keterangan: t?.keterangan ?? "",
            dirty: !t,
          },
        ];
      }),
    ),
  );
  const dow = new Date(tanggal + "T00:00:00Z").getUTCDay();
  const tipe = holidays.includes(tanggal) || !lembur.hari_kerja.includes(dow) ? "libur" : "kerja";

  const preview = useMemo(
    () =>
      Object.fromEntries(
        Object.values(rows).map((r) => [
          r.employee_id,
          r.status_kehadiran === "hadir" ? hitungJamHarian({ tanggal, jam_masuk: r.jam_masuk, jam_keluar: r.jam_keluar }, lembur, holidays) : null,
        ]),
      ),
    [rows, tanggal, lembur, holidays],
  );

  const set = (id: string, patch: Partial<AbsensiRow>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch, dirty: true } }));
  const locked = (id: string) => existing[id]?.approval_status === "approved";

  const terapkanSemua = () =>
    setRows((r) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, locked(id) || v.status_kehadiran !== "hadir" ? v : { ...v, jam_masuk: masukAll, jam_keluar: keluarAll, dirty: true }])));

  const simpanOffline = async (list: AbsensiRow[], alasan: string) => {
    if (!offlineSupported()) return setMsg({ err: "Tidak ada koneksi dan browser ini tidak mendukung penyimpanan offline." });
    await enqueue(userId, tanggal, list);
    setQueued((q) => new Set([...q, ...list.map((r) => r.employee_id)]));
    setRows((r) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { ...v, dirty: false }])));
    setMsg({ ok: `${list.length} data disimpan di HP (${alasan}). Akan dikirim otomatis saat online.`, offline: true });
  };

  const simpan = () => {
    // entri yang masih antre ikut dikirim ulang agar versi terbaru yang tersimpan
    const list = Object.values(rows)
      .filter((r) => (r.dirty || queued.has(r.employee_id)) && !locked(r.employee_id))
      .map((r) => ({ employee_id: r.employee_id, status_kehadiran: r.status_kehadiran, jam_masuk: r.jam_masuk, jam_keluar: r.jam_keluar, lokasi: r.lokasi, keterangan: r.keterangan }));
    if (!list.length) return setMsg({ ok: "Tidak ada perubahan." });
    start(async () => {
      if (!navigator.onLine) return simpanOffline(list, "offline");
      let res: Awaited<ReturnType<typeof simpanAbsensi>>;
      try {
        res = await simpanAbsensi(tanggal, list);
      } catch {
        return simpanOffline(list, "koneksi terputus");
      }
      if (res.error) return setMsg({ err: res.error });
      // input online terbaru menggantikan antrean offline untuk karyawan/tanggal yang sama
      await removeKeys(list.map((r) => `${userId}|${r.employee_id}|${tanggal}`)).catch(() => {});
      setQueued(new Set());
      setRows((r) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { ...v, dirty: false }])));
      setMsg({ ok: `${res.ok} data tersimpan${res.dilewati ? `, ${res.dilewati} dilewati (sudah approved)` : ""}.` });
      onSaved();
    });
  };

  const hadir = Object.values(rows).filter((r) => r.status_kehadiran === "hadir").length;
  const totalJam = Object.values(preview).reduce((a, p) => a + (p?.jam_aktual ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="card grid grid-cols-2 items-end gap-2 p-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0"><span className="label">Masuk (semua)</span><input type="time" value={masukAll} onChange={(e) => setMasukAll(e.target.value)} className="input min-w-0" /></label>
        <label className="min-w-0"><span className="label">Keluar (semua)</span><input type="time" value={keluarAll} onChange={(e) => setKeluarAll(e.target.value)} className="input min-w-0" /></label>
        <button type="button" onClick={terapkanSemua} className="btn-secondary col-span-2 sm:col-span-1">Terapkan ke semua yang hadir</button>
      </div>

      <div className={`rounded-lg px-3 py-2 text-sm ${tipe === "libur" ? "bg-purple-50 text-purple-800" : "bg-brand-50 text-brand-700"}`}>
        {HARI[dow]}, {fmtTanggal(tanggal)} — <b>{tipe === "libur" ? `Hari libur${namaLibur ? ` (${namaLibur})` : ""}: seluruh jam dihitung lembur` : "Hari kerja: 8 jam normal"}</b>
        {" · "}Hadir {hadir}/{employees.length} · Total {angka(totalJam)} jam
      </div>

      {employees.length === 0 && <div className="card p-6 text-center text-sm text-gray-500">Belum ada anggota aktif di regu ini.</div>}

      <ul className="space-y-2">
        {employees.map((e) => {
          const r = rows[e.id];
          const p = preview[e.id];
          const lock = locked(e.id);
          const ex = existing[e.id];
          return (
            <li key={e.id} className={`card p-3 ${lock ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.nama}</div>
                  <div className="text-xs text-gray-500">{e.nik} · {e.klasifikasi}{e.status === "cuti" && <b className="text-amber-700"> · status Cuti</b>}</div>
                </div>
                {queued.has(e.id) ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-white">
                    <CloudOff size={11} /> Menunggu sinkron
                  </span>
                ) : ex ? (
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${ex.approval_status === "approved" ? "bg-emerald-100 text-emerald-800" : ex.approval_status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                    {lock ? <Lock size={11} /> : null}{STATUS_APPROVAL[ex.approval_status]}
                  </span>
                ) : null}
              </div>
              {ex?.approval_status === "rejected" && ex.catatan_approval && <p className="mt-1 text-xs text-red-700">Catatan admin: {ex.catatan_approval}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(STATUS_KEHADIRAN).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={lock}
                    onClick={() => set(e.id, { status_kehadiran: k })}
                    className={`rounded-full border px-3 py-1.5 text-xs ${r.status_kehadiran === k ? (k === "hadir" ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-700 bg-gray-700 text-white") : "border-gray-300 bg-white text-gray-700"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {r.status_kehadiran === "hadir" && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label><span className="label">Masuk</span><input type="time" disabled={lock} value={r.jam_masuk ?? ""} onChange={(ev) => set(e.id, { jam_masuk: ev.target.value })} className="input" /></label>
                  <label><span className="label">Keluar</span><input type="time" disabled={lock} value={r.jam_keluar ?? ""} onChange={(ev) => set(e.id, { jam_keluar: ev.target.value })} className="input" /></label>
                  <label><span className="label">Lokasi/area (ops.)</span><input disabled={lock} value={r.lokasi ?? ""} onChange={(ev) => set(e.id, { lokasi: ev.target.value })} className="input" /></label>
                  <label><span className="label">Pekerjaan (ops.)</span><input disabled={lock} value={r.keterangan ?? ""} onChange={(ev) => set(e.id, { keterangan: ev.target.value })} className="input" /></label>
                </div>
              )}
              {p && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                  <span>Aktual <b>{angka(p.jam_aktual)}</b></span>
                  <span>Normal <b>{angka(p.jam_normal)}</b></span>
                  <span>Lembur <b>{angka(p.jam_lembur)}</b></span>
                  <span>Konversi <b className="text-brand-700">{angka(p.jam_konversi)}</b></span>
                  {p.peringatan.map((w) => (
                    <span key={w} className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={12} />{w}</span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-16 z-10 flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-2">
        <div className="text-sm">
          {msg?.ok && (
            <span className={`inline-flex items-center gap-1 ${msg.offline ? "text-gray-800" : "text-emerald-700"}`}>
              {msg.offline ? <CloudOff size={16} /> : <CheckCircle2 size={16} />}
              {msg.ok}
            </span>
          )}
          {msg?.err && <span className="text-red-700">{msg.err}</span>}
        </div>
        <button type="button" onClick={simpan} disabled={busy || !employees.length} className="btn-primary px-6 py-2.5">
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
