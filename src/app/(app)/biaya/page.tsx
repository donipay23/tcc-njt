import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { akhirBulan, angka, hariIni, namaBulan, persen, rupiah, tambahBulan, tanggal } from "@/lib/format";
import { Badge, Card, DataTable, Field, Flash, Kpi, PageHeader, toneStatus } from "@/components/ui";
import { BarChartCard, DonutChartCard } from "@/components/charts";
import { SubmitButton } from "@/components/submit-button";
import { ExportButtons } from "@/components/export-buttons";
import { hapusBiaya, simpanBudget, tambahBiaya, tambahKategori, ubahStatusBiaya } from "./actions";

export const metadata = { title: "Cost operasional" };

export default async function Biaya({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const sp = await searchParams;
  const bulan = sp.bulan && /^\d{4}-\d{2}$/.test(sp.bulan) ? sp.bulan : hariIni().slice(0, 7);
  const awal = `${bulan}-01`;
  const akhir = akhirBulan(awal);
  const supabase = await createClient();

  const [cats, exps, budgets, keu, aktif, projStart] = await Promise.all([
    supabase.from("cost_categories").select("id, nama, aktif").order("nama"),
    supabase.from("expenses").select("*").gte("tanggal", awal).lte("tanggal", akhir).order("tanggal", { ascending: false }),
    supabase.from("budgets").select("category_id, jumlah").eq("bulan", awal),
    supabase.rpc("keuangan_bulanan", { p_mulai: tambahBulan(awal, -11), p_selesai: awal }),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "aktif"),
    supabase.from("employees").select("tanggal_masuk").order("tanggal_masuk").limit(1),
  ]);
  const start = (projStart.data?.[0]?.tanggal_masuk as string | undefined) ?? awal;
  const { data: kum } = await supabase.rpc("keuangan_bulanan", { p_mulai: start < awal ? start : awal, p_selesai: awal });

  const catName = new Map(((cats.data as any[]) ?? []).map((c) => [c.id, c.nama]));
  const list = ((exps.data as any[]) ?? []).map((e) => ({ ...e, kategori: catName.get(e.category_id) ?? "-" }));
  const bukti = await Promise.all(
    list.map(async (e) => (e.bukti_path ? (await supabase.storage.from("bukti").createSignedUrl(e.bukti_path, 600)).data?.signedUrl : null)),
  );
  list.forEach((e, i) => (e.bukti_url = bukti[i]));

  const bulanIni = ((keu.data as any[]) ?? []).find((k) => k.bulan === awal) ?? { biaya_tenaga_kerja: 0, biaya_non_gaji: 0, jam_aktual: 0 };
  const tk = Number(bulanIni.biaya_tenaga_kerja);
  const ng = Number(bulanIni.biaya_non_gaji);
  const total = tk + ng;
  const kumulatif = ((kum as any[]) ?? []).reduce((a, k) => a + Number(k.biaya_tenaga_kerja) + Number(k.biaya_non_gaji), 0);
  const jam = Number(bulanIni.jam_aktual);

  const perKat = new Map<string, number>();
  for (const e of list) if (e.status === "dibayar") perKat.set(e.category_id, (perKat.get(e.category_id) ?? 0) + Number(e.jumlah));
  const donut = [{ nama: "Tenaga kerja (payroll)", nilai: tk }, ...[...perKat.entries()].map(([k, v]) => ({ nama: catName.get(k) ?? "-", nilai: v }))];
  const budgetMap = new Map(((budgets.data as any[]) ?? []).map((b) => [b.category_id, Number(b.jumlah)]));
  const bva = ((cats.data as any[]) ?? []).filter((c) => c.aktif).map((c) => {
    const b = budgetMap.get(c.id) ?? 0;
    const a = perKat.get(c.id) ?? 0;
    return { id: c.id, nama: c.nama, budget: b, aktual: a, selisih: b - a, persen: b ? (a / b) * 100 : null };
  });

  return (
    <>
      <PageHeader
        title="Cost operasional"
        subtitle={namaBulan(awal, true)}
        actions={
          <>
            <Link className="btn-secondary" href={`?bulan=${tambahBulan(awal, -1).slice(0, 7)}`}>‹</Link>
            <form method="get"><input type="month" name="bulan" defaultValue={bulan} className="input" /></form>
            <Link className="btn-secondary" href={`?bulan=${tambahBulan(awal, 1).slice(0, 7)}`}>›</Link>
            <ExportButtons
              filename={`biaya-${bulan}`}
              judul="Biaya Non-Gaji"
              subjudul={namaBulan(awal, true)}
              cols={[{ key: "tanggal", label: "Tanggal", type: "tanggal" }, { key: "kategori", label: "Kategori" }, { key: "deskripsi", label: "Deskripsi" }, { key: "vendor", label: "Vendor" }, { key: "metode_bayar", label: "Metode" }, { key: "status", label: "Status" }, { key: "jumlah", label: "Jumlah", type: "rupiah" }]}
              rows={list}
            />
          </>
        }
      />
      <Flash sp={sp} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Total cost bulan ini" value={rupiah(total)} />
        <Kpi label="Biaya tenaga kerja" value={rupiah(tk)} hint="dari payroll periode yg berakhir bulan ini" />
        <Kpi label="Biaya non-gaji" value={rupiah(ng)} />
        <Kpi label="Kumulatif proyek" value={rupiah(kumulatif)} />
        <Kpi label="Cost per karyawan" value={rupiah(aktif.count ? total / aktif.count : 0)} hint={`${aktif.count ?? 0} karyawan aktif`} />
        <Kpi label="Cost per jam kerja" value={rupiah(jam ? total / jam : 0)} hint={`${angka(jam)} jam aktual approved`} />
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Komposisi cost bulan ini"><DonutChartCard data={donut} /></Card>
        <Card title="Tren cost 12 bulan">
          <BarChartCard
            format="rupiah"
            data={((keu.data as any[]) ?? []).map((k) => ({ bulan: namaBulan(k.bulan), tk: Number(k.biaya_tenaga_kerja), ng: Number(k.biaya_non_gaji) }))}
            x="bulan"
            series={[{ key: "tk", label: "Tenaga kerja", stack: "a" }, { key: "ng", label: "Non-gaji", stack: "a" }]}
          />
        </Card>
      </div>

      <Card title="Input biaya non-gaji" className="mb-4">
        <form action={tambahBiaya} className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
          <Field label="Tanggal"><input type="date" name="tanggal" defaultValue={bulan === hariIni().slice(0, 7) ? hariIni() : awal} required className="input" /></Field>
          <Field label="Kategori">
            <select name="category_id" required className="input">
              {((cats.data as any[]) ?? []).filter((c) => c.aktif).map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
            </select>
          </Field>
          <Field label="Jumlah (Rp)"><input type="number" name="jumlah" min={0} required className="input" /></Field>
          <Field label="Status">
            <select name="status" className="input"><option value="dibayar">Dibayar</option><option value="rencana">Rencana</option></select>
          </Field>
          <Field label="Deskripsi" className="col-span-2"><input name="deskripsi" required className="input" /></Field>
          <Field label="Vendor"><input name="vendor" className="input" /></Field>
          <Field label="Metode bayar">
            <select name="metode_bayar" className="input"><option>Transfer</option><option>Tunai</option><option>Kartu</option><option>Lainnya</option></select>
          </Field>
          <Field label="Bukti (foto nota / PDF)" className="col-span-2"><input type="file" name="bukti" accept="image/*,application/pdf" capture="environment" className="input" /></Field>
          <SubmitButton className="btn-primary col-span-2 md:col-span-1">Simpan</SubmitButton>
        </form>
      </Card>

      <Card title={`Transaksi ${namaBulan(awal, true)}`} bodyClass="" className="mb-4">
        <DataTable
          rows={list}
          rowKey={(r) => r.id}
          cols={[
            { key: "deskripsi", label: "Deskripsi", primary: true, render: (r) => <>{r.deskripsi}{r.vendor && <div className="text-xs text-gray-500">{r.vendor}</div>}</> },
            { key: "tanggal", label: "Tanggal", render: (r) => tanggal(r.tanggal) },
            { key: "kategori", label: "Kategori" },
            { key: "jumlah", label: "Jumlah", num: true, render: (r) => rupiah(r.jumlah) },
            { key: "status", label: "Status", render: (r) => <Badge tone={toneStatus(r.status)}>{r.status}</Badge> },
            { key: "bukti", label: "Bukti", render: (r) => (r.bukti_url ? <a href={r.bukti_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Lihat</a> : "-") },
            {
              key: "aksi",
              label: "",
              render: (r) => (
                <div className="flex gap-1">
                  {r.status === "rencana" && (
                    <form action={ubahStatusBiaya}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="dibayar" /><SubmitButton className="btn-secondary btn-sm">Tandai dibayar</SubmitButton></form>
                  )}
                  <form action={hapusBiaya}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn-secondary btn-sm" confirm="Hapus transaksi ini?">Hapus</SubmitButton></form>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Budget vs aktual (non-gaji)" className="lg:col-span-2" bodyClass="">
          <form action={simpanBudget}>
            <input type="hidden" name="bulan" value={bulan} />
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr><th className="th">Kategori</th><th className="th num">Budget</th><th className="th num">Aktual</th><th className="th num">Selisih</th><th className="th num">Serapan</th></tr></thead>
                <tbody>
                  {bva.map((b) => (
                    <tr key={b.id}>
                      <td className="td">{b.nama}<input type="hidden" name="category_id" value={b.id} /></td>
                      <td className="td num"><input name="jumlah" type="number" min={0} defaultValue={b.budget || ""} className="input w-36 px-2 py-1 text-right" /></td>
                      <td className="td num">{rupiah(b.aktual)}</td>
                      <td className={`td num ${b.selisih < 0 ? "font-semibold text-red-700" : ""}`}>{rupiah(b.selisih)}</td>
                      <td className="td num">{b.persen == null ? "-" : persen(b.persen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end p-3"><SubmitButton className="btn-secondary">Simpan budget {namaBulan(awal)}</SubmitButton></div>
          </form>
        </Card>
        <Card title="Kategori biaya">
          <ul className="mb-3 flex flex-wrap gap-1">{((cats.data as any[]) ?? []).map((c) => <Badge key={c.id}>{c.nama}</Badge>)}</ul>
          <form action={tambahKategori} className="flex gap-2">
            <input type="hidden" name="bulan" value={bulan} />
            <input name="nama" required className="input" placeholder="Kategori baru" />
            <SubmitButton className="btn-secondary">Tambah</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
