import Link from "next/link";
import { getPerusahaan, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodeCutoff } from "@/lib/periode";
import { hariIni, namaBulan, tanggal } from "@/lib/format";
import { Badge, Card, DataTable, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { buatPeriode } from "./actions";

export const metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const sp = await searchParams;
  const p = await getPerusahaan();
  const supabase = await createClient();
  const { data: periods } = await supabase.from("payroll_periods").select("*").order("mulai", { ascending: false });
  const def = periodeCutoff(p.tanggal_mulai_periode, hariIni());
  return (
    <>
      <PageHeader title="Payroll" subtitle="Periode payroll, perhitungan gaji + lembur + BPJS + cadangan THR, kunci periode & slip gaji" />
      <Flash sp={sp} />
      <Card title="Buat periode baru" className="mb-4">
        <form action={buatPeriode} className="grid grid-cols-2 items-end gap-3 md:grid-cols-5">
          <Field label="Nama periode"><input name="nama" defaultValue={namaBulan(def.selesai, true)} className="input" /></Field>
          <Field label="Mulai"><input type="date" name="mulai" defaultValue={def.mulai} required className="input" /></Field>
          <Field label="Selesai"><input type="date" name="selesai" defaultValue={def.selesai} required className="input" /></Field>
          <Field label="Tanggal bayar"><input type="date" name="tanggal_bayar" className="input" /></Field>
          <SubmitButton>Buat periode</SubmitButton>
        </form>
      </Card>
      <Card bodyClass="">
        <DataTable
          rows={(periods as any[]) ?? []}
          rowKey={(r) => r.id}
          empty="Belum ada periode payroll."
          cols={[
            { key: "nama", label: "Periode", primary: true, render: (r) => <Link href={`/payroll/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.nama}</Link> },
            { key: "mulai", label: "Rentang", render: (r) => `${tanggal(r.mulai)} – ${tanggal(r.selesai)}` },
            { key: "tanggal_bayar", label: "Tanggal bayar", render: (r) => tanggal(r.tanggal_bayar) },
            { key: "status", label: "Status", render: (r) => (r.status === "locked" ? <Badge tone="green">Terkunci</Badge> : <Badge tone="amber">Terbuka</Badge>) },
          ]}
        />
      </Card>
    </>
  );
}
