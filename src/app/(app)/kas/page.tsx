import Link from "next/link";
import { requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { agingBucket } from "@/lib/calc/invoice";
import { angka, hariIni, rupiah, selisihHari, tambahHari, tanggal } from "@/lib/format";
import { KATEGORI_KAS } from "@/lib/types";
import { Badge, Card, DataTable, Field, Flash, Kpi, PageHeader } from "@/components/ui";
import { LineChartCard } from "@/components/charts";
import { SubmitButton } from "@/components/submit-button";
import { ExportButtons } from "@/components/export-buttons";
import { hapusKas, tambahKas } from "./actions";

export const metadata = { title: "Arus kas" };

export default async function Kas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireFinance();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = hariIni();

  const [tx, invs, periods, pays] = await Promise.all([
    fetchAll((a, b) => supabase.from("cash_transactions").select("*").order("tanggal").order("created_at").range(a, b)),
    supabase.from("invoices").select("id, nomor, tanggal, tanggal_kirim, jatuh_tempo, status, total_tagihan, total_dibayar, pph23, periode_selesai"),
    supabase.from("payroll_periods").select("id, nama, mulai, selesai, tanggal_bayar, status").order("mulai", { ascending: false }),
    supabase.from("payments").select("invoice_id, tanggal"),
  ]);
  const periodList = (periods.data as any[]) ?? [];
  const payrollTotals = await Promise.all(
    periodList.map(async (p) => {
      const rows = await fetchAll((a, b) => supabase.from("payroll").select("take_home_pay, bpjs_perusahaan_total, bpjs_karyawan_total, biaya_perusahaan").eq("period_id", p.id).range(a, b));
      return {
        id: p.id,
        thp: rows.reduce((x: number, r: any) => x + Number(r.take_home_pay), 0),
        bpjs: rows.reduce((x: number, r: any) => x + Number(r.bpjs_perusahaan_total) + Number(r.bpjs_karyawan_total), 0),
        biaya: rows.reduce((x: number, r: any) => x + Number(r.biaya_perusahaan), 0),
      };
    }),
  );
  const ptMap = new Map(payrollTotals.map((p) => [p.id, p]));

  // Saldo berjalan
  let saldo = 0;
  const running = (tx as any[]).map((t) => {
    saldo += (t.arah === "masuk" ? 1 : -1) * Number(t.jumlah);
    return { ...t, saldo, label: KATEGORI_KAS[t.kategori] ?? t.kategori };
  });
  const saldoKini = saldo;
  const masukTot = (tx as any[]).filter((t) => t.arah === "masuk").reduce((a, t) => a + Number(t.jumlah), 0);
  const keluarTot = (tx as any[]).filter((t) => t.arah === "keluar").reduce((a, t) => a + Number(t.jumlah), 0);

  // Piutang & aging
  const invList = ((invs.data as any[]) ?? []).filter((i) => i.status !== "draft");
  const sisa = (i: any) => Number(i.total_tagihan) - Number(i.total_dibayar);
  const outstanding = invList.filter((i) => sisa(i) > 0);
  const aging: Record<string, { total: number; list: string[] }> = { "0-30": { total: 0, list: [] }, "31-60": { total: 0, list: [] }, "61-90": { total: 0, list: [] }, ">90": { total: 0, list: [] } };
  for (const i of outstanding) {
    const b = agingBucket(i.tanggal_kirim ?? i.tanggal, today);
    aging[b].total += sisa(i);
    aging[b].list.push(i.nomor);
  }

  // Rekonsiliasi payroll vs transfer
  const rekon = periodList
    .filter((p) => ptMap.get(p.id)?.thp)
    .map((p) => {
      const transfer = (tx as any[]).filter((t) => t.kategori === "payroll" && t.period_id === p.id).reduce((a, t) => a + Number(t.jumlah), 0);
      const thp = ptMap.get(p.id)!.thp;
      return { id: p.id, nama: p.nama, tanggal_bayar: p.tanggal_bayar, thp, transfer, selisih: thp - transfer };
    });

  // Proyeksi 90 hari: invoice belum dibayar (jatuh tempo) vs payroll belum ditransfer (tanggal bayar)
  const events: { tanggal: string; ket: string; jumlah: number }[] = [];
  for (const i of outstanding) events.push({ tanggal: i.jatuh_tempo && i.jatuh_tempo > today ? i.jatuh_tempo : today, ket: `Terima ${i.nomor}`, jumlah: sisa(i) - (Number(i.total_dibayar) ? 0 : Number(i.pph23)) });
  for (const r of rekon) if (r.selisih > 0) events.push({ tanggal: r.tanggal_bayar && r.tanggal_bayar > today ? r.tanggal_bayar : today, ket: `Payroll ${r.nama}`, jumlah: -r.selisih });
  events.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  let proj = saldoKini;
  let minSaldo = saldoKini;
  const proyeksi = [{ tanggal: today, label: tanggal(today), saldo: saldoKini, ket: "Saldo saat ini", jumlah: 0 }];
  for (const e of events.filter((e) => e.tanggal <= tambahHari(today, 90))) {
    proj += e.jumlah;
    minSaldo = Math.min(minSaldo, proj);
    proyeksi.push({ tanggal: e.tanggal, label: tanggal(e.tanggal), saldo: proj, ket: e.ket, jumlah: e.jumlah });
  }

  // Siklus modal kerja
  const firstPay = new Map<string, string>();
  for (const p of (pays.data as any[]) ?? []) if (!firstPay.has(p.invoice_id) || p.tanggal < firstPay.get(p.invoice_id)!) firstPay.set(p.invoice_id, p.tanggal);
  const siklus = invList.filter((i) => firstPay.has(i.id)).map((i) => selisihHari(i.periode_selesai, firstPay.get(i.id)!));
  const avgSiklus = siklus.length ? siklus.reduce((a, b) => a + b, 0) / siklus.length : null;
  const biayaBulanan = payrollTotals.length ? payrollTotals.slice(0, 3).reduce((a, p) => a + p.biaya, 0) / Math.min(3, payrollTotals.length) : 0;
  const modalKerja = avgSiklus != null ? (biayaBulanan * avgSiklus) / 30 : null;

  return (
    <>
      <PageHeader
        title="Arus kas & balancing"
        subtitle="Kas masuk (pembayaran klien, modal/pinjaman) vs kas keluar (payroll, BPJS, pajak, biaya)"
        actions={
          <ExportButtons
            filename={`arus-kas-${today}`}
            judul="Buku Kas Proyek"
            subjudul={`Per ${tanggal(today)}`}
            cols={[{ key: "tanggal", label: "Tanggal", type: "tanggal" }, { key: "label", label: "Kategori" }, { key: "keterangan", label: "Keterangan" }, { key: "arah", label: "Arah" }, { key: "jumlah", label: "Jumlah", type: "rupiah" }, { key: "saldo", label: "Saldo", type: "rupiah" }]}
            rows={running}
          />
        }
      />
      <Flash sp={sp} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Saldo kas" value={rupiah(saldoKini)} tone={saldoKini < 0 ? "bad" : "good"} />
        <Kpi label="Total kas masuk" value={rupiah(masukTot)} />
        <Kpi label="Total kas keluar" value={rupiah(keluarTot)} />
        <Kpi label="Piutang outstanding" value={rupiah(outstanding.reduce((a, i) => a + sisa(i), 0))} href="/invoice" />
        <Kpi label="Saldo terendah (proyeksi 90 hr)" value={rupiah(minSaldo)} tone={minSaldo < 0 ? "bad" : "default"} hint={minSaldo < 0 ? "Perlu tambahan modal kerja" : undefined} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Proyeksi saldo 90 hari" className="lg:col-span-2">
          <LineChartCard format="rupiah" data={proyeksi} x="label" series={[{ key: "saldo", label: "Saldo proyeksi" }]} />
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-gray-600">
            {proyeksi.slice(1).map((p, i) => (
              <li key={i} className="flex justify-between"><span>{p.label} · {p.ket}</span><span className={p.jumlah < 0 ? "text-red-700" : "text-emerald-700"}>{rupiah(p.jumlah)}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Aging piutang">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(aging).map(([k, v]) => (
                <tr key={k} className="border-t border-gray-100">
                  <td className="py-2">{k} hari<div className="text-xs text-gray-500">{v.list.join(", ") || "-"}</div></td>
                  <td className={`py-2 text-right tabular-nums ${k === ">90" && v.total ? "font-semibold text-red-700" : ""}`}>{rupiah(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="font-semibold">Kebutuhan modal kerja</div>
            {avgSiklus == null ? (
              <p className="text-xs text-gray-500">Belum ada pembayaran klien untuk menghitung siklus.</p>
            ) : (
              <p className="text-xs text-gray-600">
                Rata-rata {angka(avgSiklus)} hari dari akhir periode kerja sampai uang klien diterima. Dengan biaya tenaga kerja ± {rupiah(biayaBulanan)}/bulan,
                estimasi modal kerja yang harus disiapkan <b>{rupiah(modalKerja)}</b>.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card title="Rekonsiliasi payroll sistem vs transfer bank" className="mb-4" bodyClass="">
        <DataTable
          rows={rekon}
          rowKey={(r) => r.id}
          empty="Belum ada payroll yang dihitung."
          cols={[
            { key: "nama", label: "Periode", primary: true, render: (r) => <Link href={`/payroll/${r.id}`} className="text-brand-700 hover:underline">{r.nama}</Link> },
            { key: "tanggal_bayar", label: "Tgl bayar", render: (r) => tanggal(r.tanggal_bayar) },
            { key: "thp", label: "Total THP sistem", num: true, render: (r) => rupiah(r.thp) },
            { key: "transfer", label: "Transfer tercatat", num: true, render: (r) => rupiah(r.transfer) },
            { key: "selisih", label: "Selisih", num: true, render: (r) => (Math.abs(r.selisih) < 1 ? <Badge tone="green">Cocok</Badge> : <span className="font-semibold text-red-700">{rupiah(r.selisih)}</span>) },
          ]}
        />
      </Card>

      <Card title="Catat transaksi kas" className="mb-4">
        <form action={tambahKas} className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
          <Field label="Tanggal"><input type="date" name="tanggal" defaultValue={today} required className="input" /></Field>
          <Field label="Kategori">
            <select name="kategori" className="input">
              {Object.entries(KATEGORI_KAS).filter(([k]) => k !== "pembayaran_invoice").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Arah (untuk 'Lainnya')">
            <select name="arah" className="input"><option value="keluar">Keluar</option><option value="masuk">Masuk</option></select>
          </Field>
          <Field label="Periode payroll (opsional)">
            <select name="period_id" className="input">
              <option value="">-</option>
              {periodList.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
          </Field>
          <Field label="Jumlah (Rp)"><input type="number" name="jumlah" min={1} required className="input" /></Field>
          <Field label="Keterangan"><input name="keterangan" className="input" /></Field>
          <SubmitButton className="btn-primary col-span-2 md:col-span-1">Simpan</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-gray-500">Pembayaran invoice tercatat otomatis dari menu Invoice. Untuk rekonsiliasi, pilih periode payroll saat mencatat transfer gaji.</p>
      </Card>

      <Card title="Buku kas" bodyClass="">
        <DataTable
          rows={[...running].reverse()}
          rowKey={(r) => r.id}
          empty="Belum ada transaksi kas."
          cols={[
            { key: "tanggal", label: "Tanggal", primary: true, render: (r) => tanggal(r.tanggal) },
            { key: "label", label: "Kategori" },
            { key: "keterangan", label: "Keterangan" },
            { key: "jumlah", label: "Jumlah", num: true, render: (r) => <span className={r.arah === "masuk" ? "text-emerald-700" : "text-red-700"}>{r.arah === "masuk" ? "+" : "−"}{rupiah(r.jumlah)}</span> },
            { key: "saldo", label: "Saldo", num: true, render: (r) => rupiah(r.saldo) },
            {
              key: "aksi",
              label: "",
              render: (r) =>
                r.payment_id ? <Badge>otomatis</Badge> : (
                  <form action={hapusKas}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn-secondary btn-sm" confirm="Hapus transaksi kas ini?">Hapus</SubmitButton></form>
                ),
            },
          ]}
        />
      </Card>
    </>
  );
}
