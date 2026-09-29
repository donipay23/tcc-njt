import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getPerusahaan, getSession, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMasters } from "@/lib/masters";
import { periodeCutoff } from "@/lib/periode";
import { upahPerJamMap } from "@/lib/upah";
import { angka, hariIni, masaKerja, rupiah, selisihHari, tanggal } from "@/lib/format";
import { STATUS_APPROVAL, STATUS_KARYAWAN } from "@/lib/types";
import { Badge, Card, Flash, Info, Kpi, PageHeader, toneStatus } from "@/components/ui";
import { AdminDashboard } from "./admin-dashboard";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  return (
    <>
      <Flash sp={sp} />
      {s.isAdmin ? <AdminDashboard s={s} sp={sp} /> : s.role === "supervisor" ? <SupervisorDashboard userId={s.userId} /> : <KaryawanDashboard employeeId={s.profile.employee_id} />}
    </>
  );
}

async function SupervisorDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();
  const p = await getPerusahaan();
  const today = hariIni();
  const { mulai, selesai } = periodeCutoff(p.tanggal_mulai_periode, today);
  const { data: teams } = await supabase.from("teams").select("id, nama").eq("supervisor_id", userId);
  const ids = (teams ?? []).map((t) => t.id);
  const { data: members } = ids.length ? await supabase.from("employees").select("id, nama, status, team_id").in("team_id", ids).in("status", ["aktif", "cuti"]) : { data: [] };
  const memberIds = (members ?? []).map((x) => x.id);
  const [todayTs, periodTs] = await Promise.all([
    memberIds.length ? supabase.from("timesheets").select("employee_id, status_kehadiran").eq("tanggal", today).in("employee_id", memberIds) : Promise.resolve({ data: [] as any[] }),
    memberIds.length
      ? supabase.from("timesheets").select("approval_status, jam_lembur, jam_konversi, catatan_approval, tanggal, employees(nama)").gte("tanggal", mulai).lte("tanggal", selesai).in("employee_id", memberIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const hadir = ((todayTs.data as any[]) ?? []).filter((t) => t.status_kehadiran === "hadir").length;
  const belum = memberIds.length - ((todayTs.data as any[]) ?? []).length;
  const pt = (periodTs.data as any[]) ?? [];
  const byStatus = (st: string) => pt.filter((t) => t.approval_status === st).length;
  const rejected = pt.filter((t) => t.approval_status === "rejected");

  return (
    <>
      <PageHeader title="Dashboard Supervisor" subtitle={(teams ?? []).map((t) => t.nama).join(", ") || "Belum ada regu"} />
      <Link href="/absensi/input" className="btn-primary mb-4 w-full py-4 text-base sm:w-auto">
        <ClipboardCheck size={20} /> Input absensi hari ini
      </Link>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Anggota regu" value={memberIds.length} />
        <Kpi label="Hadir hari ini" value={`${hadir} / ${memberIds.length}`} tone={hadir ? "good" : "default"} />
        <Kpi label="Belum diinput hari ini" value={belum} tone={belum ? "warn" : "good"} />
        <Kpi label="Jam lembur periode ini" value={angka(pt.reduce((a, t) => a + Number(t.jam_lembur), 0))} hint={`${angka(pt.reduce((a, t) => a + Number(t.jam_konversi), 0))} jam konversi`} />
      </div>
      <Card title={`Status approval timesheet (${tanggal(mulai)} – ${tanggal(selesai)})`} className="mb-4">
        <div className="flex flex-wrap gap-2">
          {(["submitted", "approved", "rejected"] as const).map((st) => (
            <Badge key={st} tone={toneStatus(st)}>{STATUS_APPROVAL[st]}: {byStatus(st)}</Badge>
          ))}
        </div>
      </Card>
      {rejected.length > 0 && (
        <Card title="Ditolak Admin – perlu diperbaiki" bodyClass="">
          <ul className="divide-y divide-gray-100">
            {rejected.map((r, i) => (
              <li key={i} className="px-4 py-2 text-sm">
                <Link href={`/absensi/input?tanggal=${r.tanggal}`} className="text-brand-700 hover:underline">{tanggal(r.tanggal)} · {r.employees?.nama}</Link>
                {r.catatan_approval && <div className="text-xs text-red-700">{r.catatan_approval}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

async function KaryawanDashboard({ employeeId }: { employeeId: string | null }) {
  if (!employeeId) return <PageHeader title="Beranda" subtitle="Akun Anda belum terhubung ke data karyawan. Hubungi Admin." />;
  const supabase = await createClient();
  const settings = await getSettings();
  const p = await getPerusahaan();
  const m = await getMasters();
  const today = hariIni();
  const { mulai, selesai } = periodeCutoff(p.tanggal_mulai_periode, today);
  const [e, ts, certs, slips] = await Promise.all([
    supabase.from("employees").select("*").eq("id", employeeId).single(),
    supabase.from("timesheets").select("status_kehadiran, jam_aktual, jam_normal, jam_lembur, jam_konversi, approval_status").eq("employee_id", employeeId).gte("tanggal", mulai).lte("tanggal", selesai),
    supabase.from("employee_certificates").select("nama, berlaku_sampai").eq("employee_id", employeeId).order("berlaku_sampai"),
    supabase.from("payroll").select("id, take_home_pay, payroll_periods(nama)").eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(3),
  ]);
  const upah = (await upahPerJamMap(supabase, settings.lembur)).get(employeeId);
  const t = (ts.data as any[]) ?? [];
  const sum = (k: string) => t.reduce((a, r) => a + Number(r[k] || 0), 0);
  const emp = e.data as any;
  const exp = (label: string, d?: string | null) => {
    if (!d) return null;
    const sisa = selisihHari(today, d);
    return (
      <li className="flex justify-between py-1.5 text-sm">
        <span>{label}</span>
        <span className={sisa < 0 ? "font-semibold text-red-700" : sisa <= 30 ? "font-semibold text-amber-700" : ""}>{tanggal(d)}{sisa < 0 ? " (lewat)" : sisa <= 30 ? ` (${sisa} hr)` : ""}</span>
      </li>
    );
  };
  return (
    <>
      <PageHeader title={`Halo, ${emp?.nama ?? ""}`} subtitle={`Periode ${tanggal(mulai)} – ${tanggal(selesai)}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Hari hadir" value={t.filter((r) => r.status_kehadiran === "hadir" && Number(r.jam_aktual) > 0).length} />
        <Kpi label="Jam kerja" value={angka(sum("jam_aktual"))} hint={`normal ${angka(sum("jam_normal"))}`} />
        <Kpi label="Jam lembur" value={angka(sum("jam_lembur"))} />
        <Kpi label="Jam konversi" value={angka(sum("jam_konversi"))} />
        <Kpi label="Estimasi upah lembur" value={upah != null ? rupiah(Math.round(sum("jam_konversi") * upah)) : "-"} hint="final mengikuti slip gaji" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Data diri">
          <dl className="grid grid-cols-2 gap-3">
            <Info label="NIK" value={emp?.nik} />
            <Info label="Klasifikasi" value={m.cName.get(emp?.classification_id)} />
            <Info label="Status" value={STATUS_KARYAWAN[emp?.status]} />
            <Info label="Masa kerja" value={emp ? masaKerja(emp.tanggal_masuk, emp.tanggal_keluar) : "-"} />
          </dl>
          <Link href={`/karyawan/${employeeId}`} className="btn-secondary mt-3 w-full">Lihat profil lengkap</Link>
        </Card>
        <Card title="Masa berlaku">
          <ul className="divide-y divide-gray-100">
            {exp("Kontrak PKWT", emp?.tanggal_akhir_kontrak)}
            {exp("MCU", emp?.mcu_berlaku_sampai)}
            {((certs.data as any[]) ?? []).map((c) => <span key={c.nama}>{exp(c.nama, c.berlaku_sampai)}</span>)}
          </ul>
        </Card>
        <Card title="Slip gaji terbaru" actions={<Link href="/slip" className="text-xs text-brand-700">Semua</Link>}>
          <ul className="divide-y divide-gray-100">
            {((slips.data as any[]) ?? []).map((s) => (
              <li key={s.id} className="flex justify-between py-1.5 text-sm"><span>{s.payroll_periods?.nama}</span><b>{rupiah(s.take_home_pay)}</b></li>
            ))}
            {!slips.data?.length && <li className="py-2 text-sm text-gray-500">Belum ada slip.</li>}
          </ul>
        </Card>
      </div>
      {t.some((r) => r.approval_status !== "approved") && <p className="mt-3 text-xs text-gray-500">Sebagian jam belum di-approve Admin; angka dapat berubah.</p>}
    </>
  );
}
