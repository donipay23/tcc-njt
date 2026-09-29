import Link from "next/link";
import { getPerusahaan, getSession, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getMasters } from "@/lib/masters";
import { rentangDariParams } from "@/lib/periode";
import { upahPerJamMap } from "@/lib/upah";
import { angka, rupiah, tanggal } from "@/lib/format";
import { Card, DataTable, Field, Kpi, PageHeader, type Col } from "@/components/ui";
import { BarChartCard } from "@/components/charts";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportCol } from "@/lib/export";

export const metadata = { title: "Rekap absensi & lembur" };

const GROUPS = { karyawan: "Karyawan", klasifikasi: "Klasifikasi", regu: "Supervisor / regu", area: "Area" } as const;
type G = keyof typeof GROUPS;

export default async function Rekap({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (s.role === "karyawan") return <p>Lihat menu Absensi pada profil Anda.</p>;
  const p = await getPerusahaan();
  const settings = await getSettings();
  const { mulai, selesai } = rentangDariParams(sp, p.tanggal_mulai_periode);
  const group: G = (sp.group as G) in GROUPS ? (sp.group as G) : "karyawan";
  const approvedOnly = sp.approved === "1";
  const supabase = await createClient();
  const m = await getMasters();

  const [rekap, emps, tren, trenMinggu] = await Promise.all([
    fetchAll((a, b) => supabase.rpc("rekap_timesheet", { p_mulai: mulai, p_selesai: selesai, p_hanya_approved: approvedOnly }).range(a, b)),
    fetchAll((a, b) => supabase.from("employees").select("id, nik, nama, classification_id, team_id, area_id").range(a, b)),
    supabase.rpc("tren_jam", { p_mulai: mulai, p_selesai: selesai, p_satuan: "day" }),
    supabase.rpc("tren_jam", { p_mulai: mulai, p_selesai: selesai, p_satuan: "week" }),
  ]);
  const upah = s.isAdmin ? await upahPerJamMap(supabase, settings.lembur) : new Map<string, number>();
  const empMap = new Map((emps as any[]).map((e) => [e.id, e]));

  const perKaryawan = (rekap as any[])
    .map((r) => {
      const e = empMap.get(r.employee_id) ?? {};
      const uj = upah.get(r.employee_id);
      return {
        key: r.employee_id,
        nama: e.nama ?? "-",
        nik: e.nik ?? "-",
        klasifikasi: m.cName.get(e.classification_id) ?? "(tanpa)",
        regu: m.tName.get(e.team_id) ?? "(tanpa)",
        area: m.aName.get(e.area_id) ?? "(tanpa)",
        hari_hadir: r.hari_hadir,
        sakit_izin_alpa: `${r.hari_sakit}/${r.hari_izin}/${r.hari_alpa}`,
        jam_normal: Number(r.jam_normal),
        jam_lembur: Number(r.jam_lembur),
        jam_konversi: Number(r.jam_konversi),
        jam_aktual: Number(r.jam_aktual),
        upah_lembur: uj != null ? Math.round(Number(r.jam_konversi) * uj) : null,
        peringatan: r.jumlah_peringatan,
        pending: r.jumlah_pending,
        orang: 1,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));

  let rows: any[] = perKaryawan;
  if (group !== "karyawan") {
    const agg = new Map<string, any>();
    for (const r of perKaryawan) {
      const k = r[group];
      const a = agg.get(k) ?? { key: k, nama: k, orang: 0, hari_hadir: 0, jam_normal: 0, jam_lembur: 0, jam_konversi: 0, jam_aktual: 0, upah_lembur: s.isAdmin ? 0 : null, peringatan: 0, pending: 0 };
      a.orang++;
      a.hari_hadir += r.hari_hadir;
      a.jam_normal += r.jam_normal;
      a.jam_lembur += r.jam_lembur;
      a.jam_konversi += r.jam_konversi;
      a.jam_aktual += r.jam_aktual;
      if (a.upah_lembur != null) a.upah_lembur += r.upah_lembur ?? 0;
      a.peringatan += r.peringatan;
      a.pending += r.pending;
      agg.set(k, a);
    }
    rows = [...agg.values()].sort((a, b) => b.jam_aktual - a.jam_aktual);
  }

  const tot = perKaryawan.reduce(
    (a, r) => ({ normal: a.normal + r.jam_normal, lembur: a.lembur + r.jam_lembur, konversi: a.konversi + r.jam_konversi, upah: a.upah + (r.upah_lembur ?? 0), warn: a.warn + r.peringatan }),
    { normal: 0, lembur: 0, konversi: 0, upah: 0, warn: 0 },
  );
  const top10 = [...perKaryawan].sort((a, b) => b.jam_konversi - a.jam_konversi).slice(0, 10).filter((r) => r.jam_konversi > 0);

  const cols: Col<any>[] = [
    group === "karyawan"
      ? { key: "nama", label: "Karyawan", primary: true, render: (r) => <Link href={`/absensi/kalender/${r.key}?bulan=${mulai.slice(0, 7)}`} className="text-brand-700 hover:underline">{r.nama}<div className="text-xs text-gray-500">{r.nik}</div></Link> }
      : { key: "nama", label: GROUPS[group], primary: true },
    ...(group === "karyawan" ? [{ key: "klasifikasi", label: "Klasifikasi" }, { key: "regu", label: "Regu", mobile: false }] : [{ key: "orang", label: "Orang", num: true }]),
    { key: "hari_hadir", label: "Hari hadir", num: true },
    ...(group === "karyawan" ? [{ key: "sakit_izin_alpa", label: "S/I/A", mobile: false }] : []),
    { key: "jam_normal", label: "Jam normal", num: true, render: (r) => angka(r.jam_normal) },
    { key: "jam_lembur", label: "Lembur aktual", num: true, render: (r) => angka(r.jam_lembur) },
    { key: "jam_konversi", label: "Jam konversi", num: true, render: (r) => <b>{angka(r.jam_konversi)}</b> },
    ...(s.isAdmin ? [{ key: "upah_lembur", label: "Upah lembur (est.)", num: true, render: (r: any) => (r.upah_lembur == null ? "-" : rupiah(r.upah_lembur)) }] : []),
    { key: "peringatan", label: "Peringatan", num: true, render: (r) => (r.peringatan ? <span className="font-semibold text-amber-700">{r.peringatan}</span> : "0") },
  ];
  const exportCols: ExportCol[] = [
    { key: "nama", label: GROUPS[group] },
    ...(group === "karyawan" ? [{ key: "nik", label: "NIK" }, { key: "klasifikasi", label: "Klasifikasi" }, { key: "regu", label: "Regu" }, { key: "area", label: "Area" }] : [{ key: "orang", label: "Orang", type: "angka" as const }]),
    { key: "hari_hadir", label: "Hari hadir", type: "angka" },
    { key: "jam_normal", label: "Jam normal", type: "angka" },
    { key: "jam_lembur", label: "Jam lembur aktual", type: "angka" },
    { key: "jam_konversi", label: "Jam konversi", type: "angka" },
    { key: "jam_aktual", label: "Jam aktual (tagihan)", type: "angka" },
    ...(s.isAdmin ? [{ key: "upah_lembur", label: "Upah lembur", type: "rupiah" as const }] : []),
    { key: "peringatan", label: "Hari dgn peringatan", type: "angka" },
  ];

  const link = (g: G) => `?${new URLSearchParams({ mulai, selesai, group: g, ...(approvedOnly ? { approved: "1" } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Rekap absensi & lembur"
        subtitle={`${tanggal(mulai)} – ${tanggal(selesai)}${approvedOnly ? " · hanya approved" : ""}`}
        actions={<ExportButtons filename={`rekap-lembur-${group}-${mulai}`} judul={`Rekap Lembur per ${GROUPS[group]}`} subjudul={`${tanggal(mulai)} – ${tanggal(selesai)}`} cols={exportCols} rows={rows} />}
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <Field label="Dari"><input type="date" name="mulai" defaultValue={mulai} className="input" /></Field>
        <Field label="Sampai"><input type="date" name="selesai" defaultValue={selesai} className="input" /></Field>
        <input type="hidden" name="group" value={group} />
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="approved" value="1" defaultChecked={approvedOnly} className="h-4 w-4" /> Hanya approved</label>
        <button className="btn-primary">Terapkan</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Jam normal" value={angka(tot.normal)} />
        <Kpi label="Jam lembur aktual" value={angka(tot.lembur)} />
        <Kpi label="Jam konversi" value={angka(tot.konversi)} />
        {s.isAdmin && <Kpi label="Upah lembur (estimasi)" value={rupiah(tot.upah)} />}
        <Kpi label="Hari dgn peringatan" value={tot.warn} tone={tot.warn ? "warn" : "default"} hint="Lembur > 4 j/hari, > 18 j/minggu, > 12 j kerja, dll." href={`/absensi/approval?mulai=${mulai}&selesai=${selesai}&status=peringatan`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Tren jam harian">
          <BarChartCard
            data={((tren.data as any[]) ?? []).map((t) => ({ tgl: tanggal(t.bucket).slice(0, 5), normal: Number(t.jam_normal), lembur: Number(t.jam_lembur) }))}
            x="tgl"
            series={[{ key: "normal", label: "Normal", stack: "a" }, { key: "lembur", label: "Lembur aktual", stack: "a" }]}
          />
        </Card>
        <Card title="Jam normal vs lembur per minggu">
          <BarChartCard
            data={((trenMinggu.data as any[]) ?? []).map((t) => ({ minggu: tanggal(t.bucket).slice(0, 5), normal: Number(t.jam_normal), lembur: Number(t.jam_lembur), konversi: Number(t.jam_konversi) }))}
            x="minggu"
            series={[{ key: "normal", label: "Normal" }, { key: "lembur", label: "Lembur aktual" }, { key: "konversi", label: "Konversi" }]}
          />
        </Card>
      </div>

      <Card title="Top 10 lembur tertinggi (jam konversi)" className="mb-4">
        <BarChartCard data={top10.map((t) => ({ nama: t.nama, konversi: t.jam_konversi }))} x="nama" series={[{ key: "konversi", label: "Jam konversi" }]} horizontal height={Math.max(160, top10.length * 30)} />
      </Card>

      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(GROUPS) as G[]).map((g) => (
          <Link key={g} href={link(g)} className={`rounded-full px-3 py-1.5 text-sm ${g === group ? "bg-brand-600 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}>
            per {GROUPS[g]}
          </Link>
        ))}
      </div>
      <Card bodyClass="">
        <DataTable cols={cols} rows={rows} rowKey={(r) => r.key} />
      </Card>
    </>
  );
}
