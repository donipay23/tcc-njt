import Link from "next/link";
import { requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { agingBucket } from "@/lib/calc/invoice";
import { hariIni, rupiah, tanggal } from "@/lib/format";
import { STATUS_INVOICE } from "@/lib/types";
import { Badge, Card, DataTable, Field, Flash, Kpi, PageHeader, toneStatus } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { buatInvoice } from "./actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireFinance();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = hariIni();
  const [inv, periods] = await Promise.all([
    supabase.from("invoices").select("*").order("tanggal", { ascending: false }),
    supabase.from("payroll_periods").select("id, nama, mulai, selesai").order("mulai", { ascending: false }),
  ]);
  const list = (inv.data as any[]) ?? [];
  const outstanding = list.filter((i) => i.status !== "draft" && i.status !== "lunas");
  const sisa = (i: any) => Number(i.total_tagihan) - Number(i.total_dibayar);
  const aging: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 };
  for (const i of outstanding) aging[agingBucket(i.tanggal_kirim ?? i.tanggal, today)] += sisa(i);
  const overdue = outstanding.filter((i) => i.jatuh_tempo && i.jatuh_tempo < today);

  return (
    <>
      <PageHeader title="Invoice ke klien" subtitle="Model man-hour: Σ jam aktual (tanpa pengali) × rate klasifikasi yang berlaku di tanggal kerja. Hanya timesheet approved." />
      <Flash sp={sp} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Piutang outstanding" value={rupiah(outstanding.reduce((a, i) => a + sisa(i), 0))} />
        <Kpi label="Lewat jatuh tempo" value={overdue.length} tone={overdue.length ? "bad" : "default"} hint={rupiah(overdue.reduce((a, i) => a + sisa(i), 0))} />
        {Object.entries(aging).map(([k, v]) => <Kpi key={k} label={`Aging ${k} hari`} value={rupiah(v)} tone={k === ">90" && v > 0 ? "bad" : "default"} />)}
      </div>
      <Card title="Buat draft invoice" className="mb-4">
        <form action={buatInvoice} className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
          <Field label="Periode payroll" className="col-span-2">
            <select name="period_id" className="input">
              <option value="">— pakai rentang tanggal —</option>
              {((periods.data as any[]) ?? []).map((p) => <option key={p.id} value={p.id}>{p.nama} ({tanggal(p.mulai)}–{tanggal(p.selesai)})</option>)}
            </select>
          </Field>
          <Field label="atau dari"><input type="date" name="mulai" className="input" /></Field>
          <Field label="sampai"><input type="date" name="selesai" className="input" /></Field>
          <Field label="Tanggal invoice"><input type="date" name="tanggal" defaultValue={today} className="input" /></Field>
          <Field label="Nomor (kosong = otomatis)"><input name="nomor" className="input" /></Field>
          <SubmitButton className="btn-primary col-span-2 md:col-span-1">Buat draft</SubmitButton>
        </form>
      </Card>
      <Card bodyClass="">
        <DataTable
          rows={list}
          rowKey={(r) => r.id}
          empty="Belum ada invoice."
          cols={[
            { key: "nomor", label: "Nomor", primary: true, render: (r) => <Link href={`/invoice/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.nomor}</Link> },
            { key: "periode", label: "Periode kerja", render: (r) => `${tanggal(r.periode_mulai)} – ${tanggal(r.periode_selesai)}` },
            { key: "tanggal", label: "Tgl invoice", render: (r) => tanggal(r.tanggal) },
            { key: "jatuh_tempo", label: "Jatuh tempo", render: (r) => <span className={r.jatuh_tempo < today && r.status !== "lunas" && r.status !== "draft" ? "font-semibold text-red-700" : ""}>{tanggal(r.jatuh_tempo)}</span> },
            { key: "total_tagihan", label: "Total (incl. PPN)", num: true, render: (r) => rupiah(r.total_tagihan) },
            { key: "sisa", label: "Sisa", num: true, render: (r) => rupiah(sisa(r)) },
            { key: "status", label: "Status", render: (r) => <Badge tone={toneStatus(r.status)}>{STATUS_INVOICE[r.status]}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
