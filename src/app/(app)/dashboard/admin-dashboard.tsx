import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Session } from "@/lib/auth";
import { getPerusahaan, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getMasters } from "@/lib/masters";
import { rentangDariParams } from "@/lib/periode";
import { margin } from "@/lib/calc/invoice";
import { angka, hariIni, namaBulan, persen, rupiah, rupiahSingkat, tambahBulan, tambahHari, tanggal } from "@/lib/format";
import { Card, Field, Kpi, PageHeader } from "@/components/ui";
import { BarChartCard } from "@/components/charts";

export async function AdminDashboard({ s, sp }: { s: Session; sp: Record<string, string | undefined> }) {
  const supabase = await createClient();
  const m = await getMasters();
  const settings = await getSettings();
  const p = await getPerusahaan();
  const today = hariIni();
  const { mulai, selesai } = rentangDariParams(sp, p.tanggal_mulai_periode);
  const fK = sp.klasifikasi ?? "";
  const fA = sp.area ?? "";
  const fR = sp.regu ?? "";
  const filtered = !!(fK || fA || fR);

  const emps = await fetchAll((a, b) => supabase.from("employees").select("id, nama, nik, status, classification_id, area_id, team_id, tanggal_akhir_kontrak, mcu_berlaku_sampai").range(a, b));
  const match = (e: any) => (!fK || e.classification_id === fK) && (!fA || e.area_id === fA) && (!fR || e.team_id === fR);
  const empSet = new Set((emps as any[]).filter(match).map((e) => e.id));
  const aktif = (emps as any[]).filter((e) => e.status === "aktif" && match(e));

  const in30 = tambahHari(today, 30);
  const [rekap, tagihan, payroll, keu, tren, pending, invs, cash, certs] = await Promise.all([
    fetchAll((a, b) => supabase.rpc("rekap_timesheet", { p_mulai: mulai, p_selesai: selesai }).range(a, b)),
    s.canFinance ? fetchAll((a, b) => supabase.rpc("tagihan_periode", { p_mulai: mulai, p_selesai: selesai }).range(a, b)) : Promise.resolve([]),
    fetchAll((a, b) => supabase.from("payroll").select("employee_id, biaya_perusahaan, payroll_periods!inner(mulai, selesai)").gte("payroll_periods.selesai", mulai).lte("payroll_periods.selesai", selesai).range(a, b)),
    s.canFinance ? supabase.rpc("keuangan_bulanan", { p_mulai: tambahBulan(today, -5), p_selesai: today }) : Promise.resolve({ data: [] }),
    supabase.rpc("tren_jam", { p_mulai: tambahHari(today, -7 * 8), p_selesai: today, p_satuan: "week" }),
    supabase.from("timesheets").select("id", { count: "exact", head: true }).eq("approval_status", "submitted"),
    s.canFinance ? supabase.from("invoices").select("nomor, jatuh_tempo, status, total_tagihan, total_dibayar").neq("status", "draft") : Promise.resolve({ data: [] }),
    s.canFinance ? fetchAll((a, b) => supabase.from("cash_transactions").select("arah, jumlah").range(a, b)) : Promise.resolve([]),
    supabase.from("employee_certificates").select("nama, berlaku_sampai, employee_id").lte("berlaku_sampai", in30).order("berlaku_sampai").limit(50),
  ]);
  const { data: expenses } = await supabase.from("expenses").select("jumlah").eq("status", "dibayar").gte("tanggal", mulai).lte("tanggal", selesai);

  const rk = (rekap as any[]).filter((r) => empSet.has(r.employee_id));
  const sum = (arr: any[], k: string) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
  const jamAktual = sum(rk, "jam_aktual");
  const jamLembur = sum(rk, "jam_lembur");
  const jamKonversi = sum(rk, "jam_konversi");
  const warnCount = sum(rk, "jumlah_peringatan");
  const nilaiTagihan = sum((tagihan as any[]).filter((t) => empSet.has(t.employee_id)), "jumlah");
  const biayaTk = sum((payroll as any[]).filter((r) => empSet.has(r.employee_id)), "biaya_perusahaan");
  const biayaNg = filtered ? 0 : sum((expenses as any[]) ?? [], "jumlah");
  const totalCost = biayaTk + biayaNg;
  const mg = margin(nilaiTagihan, totalCost);
  const invList = (invs.data as any[]) ?? [];
  const piutang = invList.reduce((a, i) => a + Number(i.total_tagihan) - Number(i.total_dibayar), 0);
  const overdue = invList.filter((i) => i.status !== "lunas" && i.jatuh_tempo && i.jatuh_tempo < today);
  const saldo = (cash as any[]).reduce((a, t) => a + (t.arah === "masuk" ? 1 : -1) * Number(t.jumlah), 0);

  const perKlas = new Map<string, number>();
  for (const e of aktif) perKlas.set(m.cName.get(e.classification_id) ?? "(tanpa)", (perKlas.get(m.cName.get(e.classification_id) ?? "(tanpa)") ?? 0) + 1);
  const empMap = new Map((emps as any[]).map((e) => [e.id, e]));
  const pkwt = aktif.filter((e) => e.tanggal_akhir_kontrak && e.tanggal_akhir_kontrak <= in30).sort((a, b) => a.tanggal_akhir_kontrak.localeCompare(b.tanggal_akhir_kontrak));
  const mcu = aktif.filter((e) => e.mcu_berlaku_sampai && e.mcu_berlaku_sampai <= in30);
  const certList = ((certs.data as any[]) ?? []).filter((c) => empMap.get(c.employee_id)?.status === "aktif" && empSet.has(c.employee_id));

  const actions: { label: string; count: number; href: string; detail?: string; tone: "warn" | "bad" }[] = [
    { label: "Timesheet menunggu approval", count: pending.count ?? 0, href: "/absensi/approval", tone: "warn" },
    { label: "Kontrak PKWT habis ≤ 30 hari", count: pkwt.length, href: "/karyawan?status=aktif", detail: pkwt.slice(0, 5).map((e) => `${e.nama} (${tanggal(e.tanggal_akhir_kontrak)})`).join(", "), tone: "warn" },
    { label: "Sertifikat kedaluwarsa / ≤ 30 hari", count: certList.length, href: "/karyawan", detail: certList.slice(0, 5).map((c) => `${empMap.get(c.employee_id)?.nama}: ${c.nama} (${tanggal(c.berlaku_sampai)})`).join(", "), tone: "warn" },
    { label: "MCU kedaluwarsa / ≤ 30 hari", count: mcu.length, href: "/karyawan", detail: mcu.slice(0, 5).map((e) => `${e.nama} (${tanggal(e.mcu_berlaku_sampai)})`).join(", "), tone: "warn" },
    { label: "Hari dengan lembur melebihi batas / peringatan", count: warnCount, href: `/absensi/approval?mulai=${mulai}&selesai=${selesai}&status=peringatan`, tone: "warn" },
    ...(s.canFinance ? [{ label: "Invoice lewat jatuh tempo", count: overdue.length, href: "/invoice", detail: overdue.map((i) => i.nomor).join(", "), tone: "bad" as const }] : []),
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${p.nama} · ${tanggal(mulai)} – ${tanggal(selesai)}`} />
      <form className="card mb-4 grid grid-cols-2 items-end gap-3 p-3 md:grid-cols-6" method="get">
        <Field label="Dari"><input type="date" name="mulai" defaultValue={mulai} className="input" /></Field>
        <Field label="Sampai"><input type="date" name="selesai" defaultValue={selesai} className="input" /></Field>
        <Field label="Klasifikasi">
          <select name="klasifikasi" defaultValue={fK} className="input"><option value="">Semua</option>{m.classifications.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}</select>
        </Field>
        <Field label="Area">
          <select name="area" defaultValue={fA} className="input"><option value="">Semua</option>{m.areas.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}</select>
        </Field>
        <Field label="Supervisor / regu">
          <select name="regu" defaultValue={fR} className="input"><option value="">Semua</option>{m.teams.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}</select>
        </Field>
        <button className="btn-primary">Terapkan</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Karyawan aktif" value={angka(aktif.length)} href="/karyawan" />
        <Kpi label="Jam kerja aktual" value={angka(jamAktual)} hint="dasar tagihan" />
        <Kpi label="Jam lembur / konversi" value={`${angka(jamLembur)} / ${angka(jamKonversi)}`} href="/absensi" />
        {s.canFinance && <Kpi label="Nilai tagihan (approved)" value={rupiahSingkat(nilaiTagihan)} hint={rupiah(nilaiTagihan)} href="/invoice" />}
        <Kpi label="Total cost" value={rupiahSingkat(totalCost)} hint={filtered ? "biaya TK sesuai filter (non-gaji tidak difilter)" : `TK ${rupiahSingkat(biayaTk)} · non-gaji ${rupiahSingkat(biayaNg)}`} href="/biaya" />
        {s.canFinance && (
          <>
            <Kpi label="Gross profit & margin" value={`${rupiahSingkat(mg.profit)} · ${persen(mg.persen)}`} tone={mg.persen >= settings.target_margin * 100 ? "good" : "bad"} href="/profit" />
            <Kpi label="Piutang outstanding" value={rupiahSingkat(piutang)} tone={overdue.length ? "bad" : "default"} href="/kas" />
            <Kpi label="Saldo kas" value={rupiahSingkat(saldo)} tone={saldo < 0 ? "bad" : "default"} href="/kas" />
          </>
        )}
      </div>

      <Card title="Perlu tindakan" className="mb-4" bodyClass="">
        <ul className="divide-y divide-gray-100">
          {actions.map((a) => (
            <li key={a.label}>
              <Link href={a.href} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">{a.count > 0 && <AlertTriangle size={15} className={a.tone === "bad" ? "text-red-600" : "text-amber-600"} />}{a.label}</div>
                  {a.count > 0 && a.detail && <div className="truncate text-xs text-gray-500">{a.detail}</div>}
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${a.count ? (a.tone === "bad" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800") : "bg-gray-100 text-gray-500"}`}>{a.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Manpower aktif per klasifikasi">
          <BarChartCard data={[...perKlas.entries()].map(([nama, jumlah]) => ({ nama, jumlah })).sort((a, b) => b.jumlah - a.jumlah)} x="nama" series={[{ key: "jumlah", label: "Orang" }]} />
        </Card>
        <Card title="Jam normal vs lembur per minggu (8 minggu)">
          <BarChartCard
            data={((tren.data as any[]) ?? []).map((t) => ({ minggu: tanggal(t.bucket).slice(0, 5), normal: Number(t.jam_normal), lembur: Number(t.jam_lembur) }))}
            x="minggu"
            series={[{ key: "normal", label: "Normal", stack: "a" }, { key: "lembur", label: "Lembur", stack: "a" }]}
          />
        </Card>
        {s.canFinance && (
          <Card title="Pendapatan vs cost vs profit (6 bulan)" className="lg:col-span-2">
            <BarChartCard
              format="rupiah"
              data={((keu.data as any[]) ?? []).map((k) => {
                const c = Number(k.biaya_tenaga_kerja) + Number(k.biaya_non_gaji);
                return { bulan: namaBulan(k.bulan), pendapatan: Number(k.pendapatan), cost: c, profit: Number(k.pendapatan) - c };
              })}
              x="bulan"
              series={[{ key: "pendapatan", label: "Pendapatan" }, { key: "cost", label: "Cost" }, { key: "profit", label: "Profit" }]}
            />
          </Card>
        )}
      </div>
    </>
  );
}
