import Link from "next/link";
import { getSession, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tanggalWaktu } from "@/lib/format";
import { Badge, Card, Field, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };
const PER = 50;

const TABEL: Record<string, string> = {
  employees: "Karyawan", employee_compensation: "Gaji karyawan", employee_allowances: "Tunjangan", timesheets: "Timesheet", payroll: "Payroll",
  payroll_periods: "Periode payroll", settings: "Pengaturan", classifications: "Klasifikasi", classification_rates: "Rate tagihan", invoices: "Invoice",
  invoice_lines: "Baris invoice", payments: "Pembayaran", cash_transactions: "Kas", expenses: "Biaya", budgets: "Budget", profiles: "Pengguna",
  holidays: "Hari libur", teams: "Regu", areas: "Area", employee_certificates: "Sertifikat", employee_documents: "Dokumen", cost_categories: "Kategori biaya",
};

function diff(o: any, n: any) {
  if (!o || !n) return null;
  const skip = new Set(["updated_at", "created_at"]);
  return Object.keys({ ...o, ...n })
    .filter((k) => !skip.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => ({ k, dari: o[k], ke: n[k] }));
}
const show = (v: unknown) => (v == null ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const s = await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("changed_at", { ascending: false }).range((page - 1) * PER, page * PER - 1);
  if (sp.tabel) q = q.eq("table_name", sp.tabel);
  if (sp.aksi) q = q.eq("action", sp.aksi);
  if (sp.dari) q = q.gte("changed_at", `${sp.dari}T00:00:00+08:00`);
  if (sp.sampai) q = q.lte("changed_at", `${sp.sampai}T23:59:59+08:00`);
  const { data, count } = await q;
  const ids = [...new Set(((data as any[]) ?? []).map((d) => d.changed_by).filter(Boolean))];
  const { data: users } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const uName = new Map(((users as any[]) ?? []).map((u) => [u.id, u.full_name]));
  const logins = s.isSuperAdmin ? (await supabase.from("login_logs").select("*").order("created_at", { ascending: false }).limit(30)).data : null;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER));
  const qs = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Audit log" subtitle="Siapa, kapan, nilai lama → nilai baru. Dicatat otomatis oleh database untuk semua tabel penting." />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <Field label="Tabel">
          <select name="tabel" defaultValue={sp.tabel ?? ""} className="input"><option value="">Semua</option>{Object.entries(TABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Aksi">
          <select name="aksi" defaultValue={sp.aksi ?? ""} className="input"><option value="">Semua</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select>
        </Field>
        <Field label="Dari"><input type="date" name="dari" defaultValue={sp.dari} className="input" /></Field>
        <Field label="Sampai"><input type="date" name="sampai" defaultValue={sp.sampai} className="input" /></Field>
        <button className="btn-primary">Filter</button>
      </form>
      <Card bodyClass="" title={`${count ?? 0} catatan`}>
        <ul className="divide-y divide-gray-100">
          {((data as any[]) ?? []).map((d) => {
            const ch = d.action === "UPDATE" ? diff(d.old_data, d.new_data) : null;
            const rec = d.new_data ?? d.old_data ?? {};
            return (
              <li key={d.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={d.action === "DELETE" ? "red" : d.action === "INSERT" ? "green" : "blue"}>{d.action}</Badge>
                  <b>{TABEL[d.table_name] ?? d.table_name}</b>
                  <span className="text-gray-600">{rec.nama ?? rec.nomor ?? rec.full_name ?? rec.key ?? rec.tanggal ?? d.record_id}</span>
                  <span className="ml-auto text-xs text-gray-500">{tanggalWaktu(d.changed_at)} · {uName.get(d.changed_by) ?? (d.changed_by ? d.changed_by.slice(0, 8) : "sistem")}</span>
                </div>
                {ch && ch.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {ch.slice(0, 12).map((c) => (
                      <li key={c.k} className="break-all"><span className="text-gray-500">{c.k}:</span> <span className="text-red-700 line-through">{show(c.dari)}</span> → <span className="text-emerald-700">{show(c.ke)}</span></li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
          <span className="text-gray-500">Halaman {page} / {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={qs(page - 1)} className="btn-secondary btn-sm">‹</Link>}
            {page < pages && <Link href={qs(page + 1)} className="btn-secondary btn-sm">›</Link>}
          </div>
        </div>
      </Card>
      {logins && (
        <Card title="Log login terakhir" className="mt-4" bodyClass="">
          <ul className="divide-y divide-gray-100 text-sm">
            {(logins as any[]).map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>{l.success ? <Badge tone="green">Berhasil</Badge> : <Badge tone="red">Gagal</Badge>} {l.identifier}</span>
                <span className="text-xs text-gray-500">{tanggalWaktu(l.created_at)} · {l.ip ?? "-"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
