import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { akhirBulan, angka, hariIni, namaBulan, rupiah, tambahBulan } from "@/lib/format";
import { upahPerJamMap } from "@/lib/upah";
import { STATUS_APPROVAL, STATUS_KEHADIRAN } from "@/lib/types";
import { Card, Kpi, PageHeader } from "@/components/ui";

export const metadata = { title: "Kalender absensi" };

const WARNA: Record<string, string> = {
  hadir: "bg-emerald-100 text-emerald-900 border-emerald-200",
  lembur: "bg-brand-100 text-brand-700 border-brand-500/30",
  libur: "bg-purple-50 text-purple-800 border-purple-200",
  sakit: "bg-sky-100 text-sky-900 border-sky-200",
  izin: "bg-amber-100 text-amber-900 border-amber-200",
  alpa: "bg-red-100 text-red-900 border-red-200",
  cuti: "bg-gray-200 text-gray-800 border-gray-300",
  kosong: "bg-white text-gray-400 border-gray-100",
};

export default async function Kalender({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  const settings = await getSettings();
  const bulan = sp.bulan && /^\d{4}-\d{2}$/.test(sp.bulan) ? sp.bulan : hariIni().slice(0, 7);
  const awal = `${bulan}-01`;
  const akhir = akhirBulan(awal);

  const { data: e } = await supabase.from("employees").select("id, nik, nama").eq("id", id).maybeSingle();
  if (!e) notFound();
  const [ts, hol] = await Promise.all([
    supabase.from("timesheets").select("*").eq("employee_id", id).gte("tanggal", awal).lte("tanggal", akhir),
    supabase.from("holidays").select("tanggal, nama").gte("tanggal", awal).lte("tanggal", akhir),
  ]);
  const byDate = new Map(((ts.data as any[]) ?? []).map((t) => [t.tanggal, t]));
  const libur = new Map(((hol.data as any[]) ?? []).map((h) => [h.tanggal, h.nama]));
  const upah = s.role !== "supervisor" ? (await upahPerJamMap(supabase, settings.lembur)).get(id) : undefined;

  const hariPertama = new Date(awal + "T00:00:00Z").getUTCDay(); // 0 = Minggu
  const offset = (hariPertama + 6) % 7; // mulai Senin
  const jumlahHari = Number(akhir.slice(8, 10));
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: jumlahHari }, (_, i) => `${bulan}-${String(i + 1).padStart(2, "0")}`)];

  const list = (ts.data as any[]) ?? [];
  const sum = (k: string) => list.reduce((a, t) => a + Number(t[k] || 0), 0);
  const count = (st: string) => list.filter((t) => t.status_kehadiran === st).length;

  return (
    <>
      <PageHeader
        title={`Kalender absensi – ${e.nama}`}
        subtitle={e.nik}
        actions={
          <>
            <Link className="btn-secondary" href={`?bulan=${tambahBulan(awal, -1).slice(0, 7)}`}>‹ {namaBulan(tambahBulan(awal, -1))}</Link>
            <span className="btn pointer-events-none bg-gray-100">{namaBulan(awal, true)}</span>
            <Link className="btn-secondary" href={`?bulan=${tambahBulan(awal, 1).slice(0, 7)}`}>{namaBulan(tambahBulan(awal, 1))} ›</Link>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Hadir" value={count("hadir")} hint={`Sakit ${count("sakit")} · Izin ${count("izin")} · Alpa ${count("alpa")}`} />
        <Kpi label="Jam normal" value={angka(sum("jam_normal"))} />
        <Kpi label="Jam lembur aktual" value={angka(sum("jam_lembur"))} />
        <Kpi label="Jam konversi" value={angka(sum("jam_konversi"))} />
        {upah != null && <Kpi label="Estimasi upah lembur" value={rupiah(Math.round(sum("jam_konversi") * upah))} hint={`${rupiah(upah)}/jam`} />}
      </div>
      <Card>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-gray-500">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const t = byDate.get(d);
            const dow = new Date(d + "T00:00:00Z").getUTCDay();
            const isLibur = libur.has(d) || !settings.lembur.hari_kerja.includes(dow);
            let kind = "kosong";
            if (t) kind = t.status_kehadiran === "hadir" ? (Number(t.jam_lembur) > 0 ? "lembur" : "hadir") : t.status_kehadiran;
            else if (isLibur) kind = "libur";
            return (
              <div key={d} className={`min-h-16 rounded-md border p-1 text-left text-[11px] sm:min-h-20 sm:p-1.5 ${WARNA[kind] ?? WARNA.kosong}`} title={libur.get(d) ?? ""}>
                <div className="flex items-center justify-between font-semibold">
                  <span className={isLibur ? "text-red-600" : ""}>{Number(d.slice(8))}</span>
                  {t && t.approval_status !== "approved" && <span title={STATUS_APPROVAL[t.approval_status]}>•</span>}
                </div>
                {t?.status_kehadiran === "hadir" ? (
                  <div className="leading-tight">
                    <div>{angka(t.jam_aktual)}j</div>
                    {Number(t.jam_lembur) > 0 && <div className="font-semibold">L {angka(t.jam_lembur)} → {angka(t.jam_konversi)}</div>}
                  </div>
                ) : t ? (
                  <div>{STATUS_KEHADIRAN[t.status_kehadiran]}</div>
                ) : libur.has(d) ? (
                  <div className="hidden truncate sm:block">{libur.get(d)}</div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[["hadir", "Hadir"], ["lembur", "Lembur"], ["libur", "Libur"], ["sakit", "Sakit"], ["izin", "Izin"], ["alpa", "Alpa"], ["cuti", "Cuti"]].map(([k, v]) => (
            <span key={k} className={`rounded border px-2 py-0.5 ${WARNA[k]}`}>{v}</span>
          ))}
          <span className="text-gray-500">• = belum approved · L x → y = lembur aktual → jam konversi</span>
        </div>
      </Card>
    </>
  );
}
