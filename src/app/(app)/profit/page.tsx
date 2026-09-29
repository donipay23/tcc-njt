import { AlertTriangle } from "lucide-react";
import { getSettings, requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { akhirBulan, angka, hariIni, namaBulan, persen, rupiah, tambahBulan, tanggal } from "@/lib/format";
import { margin } from "@/lib/calc/invoice";
import { Card, DataTable, Field, Kpi, PageHeader } from "@/components/ui";
import { BarChartCard, LineChartCard } from "@/components/charts";
import { ExportButtons } from "@/components/export-buttons";

export const metadata = { title: "Profit" };

export default async function Profit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireFinance();
  const sp = await searchParams;
  const settings = await getSettings();
  const supabase = await createClient();
  const today = hariIni();
  const { data: first } = await supabase.from("employees").select("tanggal_masuk").order("tanggal_masuk").limit(1);
  const awalProyek = (first?.[0]?.tanggal_masuk as string | undefined) ?? tambahBulan(today, -11);
  const defMulai = awalProyek.slice(0, 8) + "01";
  const mulai = sp.mulai && /^\d{4}-\d{2}-\d{2}$/.test(sp.mulai) ? sp.mulai : defMulai > today ? today.slice(0, 8) + "01" : defMulai;
  const selesai = sp.selesai && /^\d{4}-\d{2}-\d{2}$/.test(sp.selesai) ? sp.selesai : akhirBulan(today);
  const target = settings.target_margin * 100;

  const [keu, klas] = await Promise.all([
    supabase.rpc("keuangan_bulanan", { p_mulai: mulai, p_selesai: selesai }),
    supabase.rpc("profit_klasifikasi", { p_mulai: mulai, p_selesai: selesai }),
  ]);
  const bulanan = ((keu.data as any[]) ?? []).map((k) => {
    const pend = Number(k.pendapatan);
    const biaya = Number(k.biaya_tenaga_kerja) + Number(k.biaya_non_gaji);
    const mg = margin(pend, biaya);
    return { bulan: k.bulan, label: namaBulan(k.bulan), pendapatan: pend, tk: Number(k.biaya_tenaga_kerja), ng: Number(k.biaya_non_gaji), biaya, profit: mg.profit, margin: mg.persen };
  });
  let kPend = 0;
  let kBiaya = 0;
  const lr = bulanan.map((b) => {
    kPend += b.pendapatan;
    kBiaya += b.biaya;
    return { ...b, kum_pendapatan: kPend, kum_profit: kPend - kBiaya };
  });
  const tot = margin(kPend, kBiaya);
  const perKlas = ((klas.data as any[]) ?? []).map((k) => {
    const mg = margin(Number(k.pendapatan), Number(k.biaya_tenaga_kerja));
    return { ...k, profit: mg.profit, margin: mg.persen, rasio_konversi: Number(k.jam_aktual) ? Number(k.jam_konversi) / Number(k.jam_aktual) : 0 };
  });
  const bawahTarget = [
    ...bulanan.filter((b) => b.pendapatan > 0 && b.margin < target).map((b) => `Bulan ${b.label} (${persen(b.margin)})`),
    ...perKlas.filter((k) => Number(k.pendapatan) > 0 && k.margin < target).map((k) => `${k.nama} (${persen(k.margin)})`),
  ];

  return (
    <>
      <PageHeader
        title="Profit & laba-rugi proyek"
        subtitle={`${tanggal(mulai)} – ${tanggal(selesai)} · target margin ${persen(target)}`}
        actions={
          <ExportButtons
            filename={`laba-rugi-${mulai}-${selesai}`}
            judul="Laporan Laba-Rugi Proyek"
            subjudul={`${tanggal(mulai)} – ${tanggal(selesai)}`}
            cols={[
              { key: "label", label: "Bulan" },
              { key: "pendapatan", label: "Pendapatan", type: "rupiah" },
              { key: "tk", label: "Biaya tenaga kerja", type: "rupiah" },
              { key: "ng", label: "Biaya non-gaji", type: "rupiah" },
              { key: "profit", label: "Gross profit", type: "rupiah" },
              { key: "margin", label: "Margin %", type: "angka" },
              { key: "kum_pendapatan", label: "Kumulatif pendapatan", type: "rupiah" },
              { key: "kum_profit", label: "Kumulatif profit", type: "rupiah" },
            ]}
            rows={lr}
            extraSheets={[
              {
                name: "Per klasifikasi",
                cols: [
                  { key: "nama", label: "Klasifikasi" },
                  { key: "jam_aktual", label: "Jam aktual", type: "angka" },
                  { key: "jam_konversi", label: "Jam konversi", type: "angka" },
                  { key: "pendapatan", label: "Pendapatan", type: "rupiah" },
                  { key: "gaji_tunjangan", label: "Gaji + tunjangan", type: "rupiah" },
                  { key: "upah_lembur", label: "Upah lembur", type: "rupiah" },
                  { key: "bpjs", label: "BPJS", type: "rupiah" },
                  { key: "biaya_tenaga_kerja", label: "Biaya TK total", type: "rupiah" },
                  { key: "profit", label: "Margin Rp", type: "rupiah" },
                  { key: "margin", label: "Margin %", type: "angka" },
                ],
                rows: perKlas,
              },
            ]}
          />
        }
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <Field label="Dari"><input type="date" name="mulai" defaultValue={mulai} className="input" /></Field>
        <Field label="Sampai"><input type="date" name="selesai" defaultValue={selesai} className="input" /></Field>
        <button className="btn-primary">Terapkan</button>
      </form>
      {bawahTarget.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Margin di bawah target {persen(target)}:</div>
          <div className="mt-1">{bawahTarget.join(" · ")}</div>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Pendapatan (sebelum pajak)" value={rupiah(kPend)} />
        <Kpi label="Total biaya" value={rupiah(kBiaya)} />
        <Kpi label="Gross profit" value={rupiah(tot.profit)} tone={tot.profit >= 0 ? "good" : "bad"} />
        <Kpi label="Margin" value={persen(tot.persen)} tone={tot.persen >= target ? "good" : "bad"} />
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Pendapatan vs biaya vs profit per bulan">
          <BarChartCard format="rupiah" data={bulanan} x="label" series={[{ key: "pendapatan", label: "Pendapatan" }, { key: "biaya", label: "Biaya" }, { key: "profit", label: "Profit" }]} />
        </Card>
        <Card title="Kumulatif">
          <LineChartCard format="rupiah" data={lr} x="label" series={[{ key: "kum_pendapatan", label: "Pendapatan kumulatif" }, { key: "kum_profit", label: "Profit kumulatif" }]} />
        </Card>
      </div>
      <Card title="Laba-rugi bulanan" className="mb-4" bodyClass="">
        <DataTable
          rows={lr}
          rowKey={(r) => r.bulan}
          cols={[
            { key: "label", label: "Bulan", primary: true },
            { key: "pendapatan", label: "Pendapatan", num: true, render: (r) => rupiah(r.pendapatan) },
            { key: "tk", label: "Biaya TK", num: true, render: (r) => rupiah(r.tk) },
            { key: "ng", label: "Non-gaji", num: true, render: (r) => rupiah(r.ng) },
            { key: "profit", label: "Gross profit", num: true, render: (r) => <span className={r.profit < 0 ? "text-red-700" : ""}>{rupiah(r.profit)}</span> },
            { key: "margin", label: "Margin", num: true, render: (r) => <span className={r.pendapatan && r.margin < target ? "font-semibold text-red-700" : ""}>{persen(r.margin)}</span> },
            { key: "kum_profit", label: "Profit kumulatif", num: true, render: (r) => rupiah(r.kum_profit) },
          ]}
        />
      </Card>
      <Card title="Margin per klasifikasi (tagihan jam aktual vs biaya dengan jam konversi)" bodyClass="">
        <DataTable
          rows={perKlas}
          rowKey={(r) => r.classification_id}
          empty="Belum ada data: perlu timesheet approved + payroll yang sudah dihitung pada rentang ini."
          cols={[
            { key: "nama", label: "Klasifikasi", primary: true },
            { key: "jam_aktual", label: "Jam aktual", num: true, render: (r) => angka(r.jam_aktual) },
            { key: "rasio", label: "Konversi/aktual", num: true, render: (r) => `${angka(r.rasio_konversi)}×` },
            { key: "pendapatan", label: "Pendapatan", num: true, render: (r) => rupiah(r.pendapatan) },
            { key: "gaji_tunjangan", label: "Gaji + tunj.", num: true, render: (r) => rupiah(r.gaji_tunjangan) },
            { key: "upah_lembur", label: "Lembur", num: true, render: (r) => rupiah(r.upah_lembur) },
            { key: "bpjs", label: "BPJS", num: true, render: (r) => rupiah(r.bpjs) },
            { key: "profit", label: "Margin", num: true, render: (r) => <span className={r.profit < 0 ? "font-semibold text-red-700" : ""}>{rupiah(r.profit)}</span> },
            { key: "margin", label: "%", num: true, render: (r) => <span className={r.margin < target ? "font-semibold text-red-700" : "text-emerald-700"}>{persen(r.margin)}</span> },
          ]}
        />
      </Card>
      <p className="mt-2 text-xs text-gray-500">
        Pendapatan diakui dari timesheet approved × rate (akrual, sebelum pajak). Biaya tenaga kerja dari payroll per periode (diakui di bulan periode berakhir), termasuk BPJS & cadangan THR/kompensasi. Biaya non-gaji berstatus “dibayar”.
      </p>
    </>
  );
}
