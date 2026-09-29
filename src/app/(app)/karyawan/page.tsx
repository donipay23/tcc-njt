import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getMasters } from "@/lib/masters";
import { hariIni, masaKerja, namaBulan, selisihHari, tambahBulan, tanggal } from "@/lib/format";
import { STATUS_KARYAWAN } from "@/lib/types";
import { Badge, Card, DataTable, Field, Flash, Kpi, PageHeader, toneStatus } from "@/components/ui";
import { BarChartCard } from "@/components/charts";
import { ExportButtons } from "@/components/export-buttons";

export const metadata = { title: "Karyawan" };
const PER_PAGE = 50;

export default async function KaryawanPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  const m = await getMasters();
  const today = hariIni();

  const rows = await fetchAll((from, to) => {
    let q = supabase
      .from("employees")
      .select("id, nik, nama, no_hp, status, jenis_kontrak, tanggal_masuk, tanggal_keluar, tanggal_akhir_kontrak, classification_id, area_id, team_id, mcu_berlaku_sampai")
      .order("nama")
      .range(from, to);
    if (sp.q) q = q.or(`nama.ilike.%${sp.q.replace(/[%,()]/g, "")}%,nik.ilike.%${sp.q.replace(/[%,()]/g, "")}%,no_ktp.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
    if (sp.status) q = q.eq("status", sp.status);
    if (sp.klasifikasi) q = q.eq("classification_id", sp.klasifikasi);
    if (sp.area) q = q.eq("area_id", sp.area);
    if (sp.regu) q = q.eq("team_id", sp.regu);
    return q;
  });

  const data = rows.map((r: any) => ({
    ...r,
    klasifikasi: m.cName.get(r.classification_id) ?? "-",
    area: m.aName.get(r.area_id) ?? "-",
    regu: m.tName.get(r.team_id) ?? "-",
    masa_kerja: masaKerja(r.tanggal_masuk, r.tanggal_keluar),
    status_label: STATUS_KARYAWAN[r.status] ?? r.status,
  }));
  const page = Math.max(1, Number(sp.page) || 1);
  const pages = Math.max(1, Math.ceil(data.length / PER_PAGE));
  const slice = data.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  let ringkasan: any = null;
  let manpower: { bulan: string; jumlah: number }[] = [];
  if (s.isAdmin) {
    const [r1, r2] = await Promise.all([
      supabase.rpc("ringkasan_karyawan"),
      supabase.rpc("manpower_bulanan", { p_mulai: tambahBulan(today, -11), p_selesai: today }),
    ]);
    ringkasan = r1.data;
    manpower = (r2.data ?? []).map((x: any) => ({ bulan: namaBulan(x.bulan), jumlah: x.jumlah }));
  }

  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("page", String(p));
    return `?${u}`;
  };

  return (
    <>
      <PageHeader
        title={s.isAdmin ? "Data Karyawan" : "Tim Saya"}
        subtitle={`${data.length} karyawan`}
        actions={
          <>
            {s.isAdmin && (
              <>
                <Link href="/karyawan/baru" className="btn-primary"><Plus size={16} /> Tambah</Link>
                <Link href="/karyawan/import" className="btn-secondary"><Upload size={16} /> Import Excel</Link>
              </>
            )}
            <ExportButtons
              filename={`karyawan-${today}`}
              judul="Data Karyawan"
              subjudul={`Per ${tanggal(today)}`}
              cols={[
                { key: "nik", label: "NIK" },
                { key: "nama", label: "Nama" },
                { key: "klasifikasi", label: "Klasifikasi" },
                { key: "area", label: "Area" },
                { key: "regu", label: "Regu" },
                { key: "status_label", label: "Status" },
                { key: "jenis_kontrak", label: "Kontrak" },
                { key: "tanggal_masuk", label: "Tgl masuk", type: "tanggal" },
                { key: "tanggal_akhir_kontrak", label: "Akhir PKWT", type: "tanggal" },
                { key: "masa_kerja", label: "Masa kerja" },
                { key: "no_hp", label: "No. HP" },
              ]}
              rows={data}
            />
          </>
        }
      />
      <Flash sp={sp} />

      {ringkasan && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Karyawan aktif" value={ringkasan.aktif} hint={`Total terdaftar ${ringkasan.total}`} />
            <Kpi label="Masuk bulan ini" value={ringkasan.baru_bulan_ini} tone="good" />
            <Kpi label="Keluar bulan ini" value={ringkasan.keluar_bulan_ini} tone={ringkasan.keluar_bulan_ini ? "warn" : "default"} />
            <Kpi
              label="Per status"
              value={<span className="text-sm font-medium">{Object.entries(ringkasan.per_status ?? {}).map(([k, v]) => `${STATUS_KARYAWAN[k] ?? k}: ${v}`).join(" · ") || "-"}</span>}
            />
          </div>
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card title="Manpower loading (12 bulan)" className="lg:col-span-2">
              <BarChartCard data={manpower} x="bulan" series={[{ key: "jumlah", label: "Karyawan" }]} />
            </Card>
            <Card title="Per klasifikasi (aktif)">
              <BarChartCard data={ringkasan.per_klasifikasi} x="nama" series={[{ key: "jumlah", label: "Orang" }]} horizontal height={Math.max(200, ringkasan.per_klasifikasi.length * 28)} />
            </Card>
          </div>
          <Card title="Per area / disiplin (aktif)" className="mb-4">
            <div className="flex flex-wrap gap-2">
              {ringkasan.per_area.map((a: any) => (
                <Badge key={a.nama} tone="blue">{a.nama}: {a.jumlah}</Badge>
              ))}
            </div>
          </Card>
        </>
      )}

      <form className="card mb-4 grid grid-cols-2 items-end gap-3 p-3 md:grid-cols-6" method="get">
        <Field label="Cari nama / NIK / KTP" className="col-span-2">
          <input name="q" defaultValue={sp.q} className="input" placeholder="Ketik lalu Enter" />
        </Field>
        <Field label="Klasifikasi">
          <select name="klasifikasi" defaultValue={sp.klasifikasi ?? ""} className="input">
            <option value="">Semua</option>
            {m.classifications.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">Semua</option>
            {Object.entries(STATUS_KARYAWAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Area">
          <select name="area" defaultValue={sp.area ?? ""} className="input">
            <option value="">Semua</option>
            {m.areas.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
          </select>
        </Field>
        <Field label="Regu / supervisor">
          <select name="regu" defaultValue={sp.regu ?? ""} className="input">
            <option value="">Semua</option>
            {m.teams.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
          </select>
        </Field>
        <button className="btn-primary col-span-2 md:col-span-1">Filter</button>
        <Link href="/karyawan" className="btn-secondary col-span-2 md:col-span-1">Reset</Link>
      </form>

      <Card bodyClass="">
        <DataTable
          rows={slice}
          rowKey={(r) => r.id}
          cols={[
            { key: "nama", label: "Nama", primary: true, render: (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/karyawan/${r.id}`}>{r.nama}</Link> },
            { key: "nik", label: "NIK" },
            { key: "klasifikasi", label: "Klasifikasi" },
            { key: "area", label: "Area", mobile: false },
            { key: "regu", label: "Regu" },
            { key: "status", label: "Status", render: (r) => <Badge tone={toneStatus(r.status)}>{r.status_label}</Badge> },
            { key: "tanggal_masuk", label: "Masuk", render: (r) => tanggal(r.tanggal_masuk), mobile: false },
            { key: "masa_kerja", label: "Masa kerja" },
            {
              key: "tanggal_akhir_kontrak",
              label: "Akhir PKWT",
              render: (r) => {
                if (!r.tanggal_akhir_kontrak) return "-";
                const sisa = selisihHari(today, r.tanggal_akhir_kontrak);
                return (
                  <span className={sisa < 0 ? "text-red-700" : sisa <= 30 ? "font-semibold text-amber-700" : ""}>
                    {tanggal(r.tanggal_akhir_kontrak)}{sisa >= 0 && sisa <= 30 ? ` (${sisa} hr)` : ""}
                  </span>
                );
              },
            },
          ]}
        />
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <span className="text-gray-500">Halaman {page} dari {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={qs(page - 1)} className="btn-secondary btn-sm">‹ Sebelumnya</Link>}
              {page < pages && <Link href={qs(page + 1)} className="btn-secondary btn-sm">Berikutnya ›</Link>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
