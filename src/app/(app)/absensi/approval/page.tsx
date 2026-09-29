import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getPerusahaan, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMasters } from "@/lib/masters";
import { rentangDariParams } from "@/lib/periode";
import { angka, tanggal, tanggalWaktu } from "@/lib/format";
import { STATUS_APPROVAL, STATUS_KEHADIRAN } from "@/lib/types";
import { Badge, Card, Field, Flash, Kpi, PageHeader, toneStatus } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { approveMassal, approvePilihan } from "../actions";

export const metadata = { title: "Approval timesheet" };
const LIMIT = 300;

export default async function Approval({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sess = await requireRole("super_admin", "admin");
  const sp = await searchParams;
  const p = await getPerusahaan();
  const { mulai, selesai } = rentangDariParams(sp, p.tanggal_mulai_periode);
  const status = sp.status ?? "submitted";
  const regu = sp.regu ?? "";
  const supabase = await createClient();
  const m = await getMasters();

  let empIds: string[] | null = null;
  if (regu) {
    const { data } = await supabase.from("employees").select("id").eq("team_id", regu);
    empIds = (data ?? []).map((x) => x.id);
  }
  const base = () => {
    let q = supabase.from("timesheets").select("id", { count: "exact", head: true }).gte("tanggal", mulai).lte("tanggal", selesai);
    if (empIds) q = q.in("employee_id", empIds);
    return q;
  };
  const [cSub, cApp, cRej, cWarn] = await Promise.all([
    base().eq("approval_status", "submitted"),
    base().eq("approval_status", "approved"),
    base().eq("approval_status", "rejected"),
    base().neq("peringatan", "{}"),
  ]);

  let q = supabase
    .from("timesheets")
    .select("id, tanggal, status_kehadiran, jam_masuk, jam_keluar, jam_aktual, jam_normal, jam_lembur, jam_konversi, tipe_hari, peringatan, approval_status, keterangan, offline_dicatat_pada, employees(nik, nama, team_id)")
    .gte("tanggal", mulai)
    .lte("tanggal", selesai)
    .order("tanggal")
    .limit(LIMIT);
  if (status !== "semua") q = status === "peringatan" ? q.neq("peringatan", "{}") : q.eq("approval_status", status);
  if (empIds) q = q.in("employee_id", empIds);
  const { data: rows } = await q;

  const hidden = (
    <>
      <input type="hidden" name="mulai" value={mulai} />
      <input type="hidden" name="selesai" value={selesai} />
      <input type="hidden" name="regu" value={regu} />
      <input type="hidden" name="status" value={status} />
    </>
  );

  return (
    <>
      <PageHeader title="Approval timesheet" subtitle={`${tanggal(mulai)} – ${tanggal(selesai)}. Timesheet yang sudah di-approve terkunci (edit hanya Super Admin & tercatat di audit log).`} />
      <Flash sp={sp} />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <Field label="Dari"><input type="date" name="mulai" defaultValue={mulai} className="input" /></Field>
        <Field label="Sampai"><input type="date" name="selesai" defaultValue={selesai} className="input" /></Field>
        <Field label="Regu">
          <select name="regu" defaultValue={regu} className="input">
            <option value="">Semua</option>
            {m.teams.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </Field>
        <Field label="Tampilkan">
          <select name="status" defaultValue={status} className="input">
            <option value="submitted">Menunggu approval</option>
            <option value="peringatan">Ada peringatan</option>
            <option value="rejected">Ditolak</option>
            <option value="approved">Approved</option>
            <option value="semua">Semua</option>
          </select>
        </Field>
        <button className="btn-primary">Terapkan</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Menunggu approval" value={cSub.count ?? 0} tone={cSub.count ? "warn" : "default"} />
        <Kpi label="Approved" value={cApp.count ?? 0} tone="good" />
        <Kpi label="Ditolak" value={cRej.count ?? 0} tone={cRej.count ? "bad" : "default"} />
        <Kpi label="Ada peringatan" value={cWarn.count ?? 0} tone={cWarn.count ? "warn" : "default"} />
      </div>

      {(cSub.count ?? 0) > 0 && (
        <form action={approveMassal} className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
          {hidden}
          <p className="text-sm">Approve <b>semua {cSub.count}</b> timesheet yang menunggu pada rentang & regu terpilih.</p>
          <SubmitButton confirm={`Approve ${cSub.count} timesheet sekaligus? Data akan terkunci.`}>Approve semua</SubmitButton>
        </form>
      )}

      <form action={approvePilihan}>
        {hidden}
        <Card
          title={`Detail (${rows?.length ?? 0}${(rows?.length ?? 0) >= LIMIT ? `, dibatasi ${LIMIT} baris – persempit filter` : ""})`}
          bodyClass=""
          actions={
            <>
              <SubmitButton name="aksi" value="approve" className="btn-primary btn-sm">Approve dipilih</SubmitButton>
              <SubmitButton name="aksi" value="reject" className="btn-danger btn-sm">Tolak dipilih</SubmitButton>
            </>
          }
        >
          <div className="px-4 pt-3">
            <input name="catatan" className="input" placeholder="Catatan untuk supervisor (opsional, mis. alasan penolakan)" />
          </div>
          {!rows?.length ? (
            <p className="p-6 text-center text-sm text-gray-500">Tidak ada data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="th w-8"></th>
                    <th className="th">Tanggal</th>
                    <th className="th">Karyawan</th>
                    <th className="th">Regu</th>
                    <th className="th">Kehadiran</th>
                    <th className="th">Masuk–Keluar</th>
                    <th className="th num">Aktual</th>
                    <th className="th num">Lembur</th>
                    <th className="th num">Konversi</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as any[]).map((r) => (
                    <tr key={r.id} className={r.peringatan?.length ? "bg-amber-50/60" : ""}>
                      <td className="td">
                        {r.approval_status !== "approved" && <input type="checkbox" name="ids" value={r.id} defaultChecked={r.approval_status === "submitted" && !r.peringatan?.length} className="h-4 w-4" />}
                        {r.approval_status === "approved" && sess.isSuperAdmin && (
                          <Link href={`/absensi/koreksi/${r.id}`} className="text-xs font-medium text-brand-700 hover:underline" title="Koreksi timesheet yang sudah di-approve">Koreksi</Link>
                        )}
                      </td>
                      <td className="td">
                        {tanggal(r.tanggal)} {r.tipe_hari === "libur" && <Badge tone="purple">Libur</Badge>}
                        {r.offline_dicatat_pada && <div className="text-xs text-gray-500" title="Diinput tanpa sinyal, disinkron kemudian">offline · {tanggalWaktu(r.offline_dicatat_pada)}</div>}
                      </td>
                      <td className="td">{r.employees?.nama}<div className="text-xs text-gray-500">{r.employees?.nik}</div></td>
                      <td className="td">{m.tName.get(r.employees?.team_id) ?? "-"}</td>
                      <td className="td"><Badge tone={toneStatus(r.status_kehadiran)}>{STATUS_KEHADIRAN[r.status_kehadiran]}</Badge></td>
                      <td className="td">{r.jam_masuk?.slice(0, 5) ?? "--"}–{r.jam_keluar?.slice(0, 5) ?? "--"}</td>
                      <td className="td num">{angka(r.jam_aktual)}</td>
                      <td className="td num">{angka(r.jam_lembur)}</td>
                      <td className="td num font-semibold">{angka(r.jam_konversi)}</td>
                      <td className="td">
                        <Badge tone={toneStatus(r.approval_status)}>{STATUS_APPROVAL[r.approval_status]}</Badge>
                        {r.peringatan?.map((w: string) => (
                          <div key={w} className="mt-0.5 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} />{w}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </form>
    </>
  );
}
