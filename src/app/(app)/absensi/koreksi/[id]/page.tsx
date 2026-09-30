import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { angka, tanggal, tanggalWaktu } from "@/lib/format";
import { STATUS_KEHADIRAN } from "@/lib/types";
import { Badge, Card, Field, Flash, Info, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { koreksiTimesheet } from "../../actions";

export const metadata = { title: "Koreksi timesheet" };

const trim = (t?: string | null) => (t ? t.slice(0, 5) : "");

export default async function Koreksi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: t } = await supabase.from("timesheets").select("*, employees(nik, nama)").eq("id", id).maybeSingle();
  if (!t) notFound();

  const [period, inv, hist] = await Promise.all([
    supabase.from("payroll_periods").select("id, nama, status").lte("mulai", t.tanggal).gte("selesai", t.tanggal).maybeSingle(),
    supabase.from("invoices").select("id, nomor, status").lte("periode_mulai", t.tanggal).gte("periode_selesai", t.tanggal).limit(1),
    supabase.from("audit_logs").select("id, action, old_data, new_data, changed_by, changed_at").eq("table_name", "timesheets").eq("record_id", id).order("changed_at", { ascending: false }).limit(10),
  ]);
  const userIds = [...new Set(((hist.data as any[]) ?? []).map((h) => h.changed_by).filter(Boolean))];
  const { data: users } = userIds.length ? await supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] };
  const uName = new Map(((users as any[]) ?? []).map((u) => [u.id, u.full_name]));
  const invoice = (inv.data as any[])?.[0];
  const locked = period.data?.status === "locked";
  const approved = t.approval_status === "approved";

  return (
    <>
      <PageHeader
        title="Koreksi timesheet"
        subtitle={<>{t.employees?.nama} ({t.employees?.nik}) · {tanggal(t.tanggal)} {t.tipe_hari === "libur" && <Badge tone="purple">Libur</Badge>}</>}
        actions={<Link href={`/absensi/approval?mulai=${t.tanggal}&selesai=${t.tanggal}&status=semua`} className="btn-secondary">Kembali ke approval</Link>}
      />
      <Flash sp={sp} />

      {!approved && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Timesheet ini belum di-approve. Perbaiki lewat Input Absensi (supervisor/admin) atau tolak di halaman Approval.
        </div>
      )}
      {approved && (locked || invoice) && (
        <div className="mb-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {locked && (
            <p className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Payroll <b>{period.data!.nama}</b> sudah dikunci. Koreksi tidak mengubah slip; setelah menyimpan,{" "}
                <Link href={`/payroll/${period.data!.id}`} className="underline">buka kunci periode</Link>, hitung ulang, lalu kunci lagi.
              </span>
            </p>
          )}
          {invoice && (
            <p className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Tanggal ini sudah ditagih di invoice <Link href={`/invoice/${invoice.id}`} className="underline">{invoice.nomor}</Link>. Nilai invoice tidak ikut berubah; buat
                penyesuaian ke klien bila perlu.
              </span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Data saat ini">
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Kehadiran" value={STATUS_KEHADIRAN[t.status_kehadiran]} />
            <Info label="Masuk – keluar" value={`${trim(t.jam_masuk) || "--"} – ${trim(t.jam_keluar) || "--"}`} />
            <Info label="Jam aktual" value={angka(t.jam_aktual)} />
            <Info label="Jam normal" value={angka(t.jam_normal)} />
            <Info label="Lembur aktual" value={angka(t.jam_lembur)} />
            <Info label="Jam konversi" value={<b>{angka(t.jam_konversi)}</b>} />
            <Info label="Approved" value={tanggalWaktu(t.approved_at)} />
            <Info label="Catatan" value={t.catatan_approval} />
          </dl>
          {t.peringatan?.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700">
              {t.peringatan.map((w: string) => (
                <li key={w} className="flex items-center gap-1"><AlertTriangle size={12} />{w}</li>
              ))}
            </ul>
          )}
        </Card>

        {approved && (
          <Card title="Koreksi">
            <form action={koreksiTimesheet} className="grid grid-cols-2 gap-3">
              <input type="hidden" name="id" value={id} />
              <Field label="Kehadiran" className="col-span-2">
                <select name="status_kehadiran" defaultValue={t.status_kehadiran} className="input">
                  {Object.entries(STATUS_KEHADIRAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Jam masuk"><input type="time" name="jam_masuk" defaultValue={trim(t.jam_masuk)} className="input" /></Field>
              <Field label="Jam keluar"><input type="time" name="jam_keluar" defaultValue={trim(t.jam_keluar)} className="input" /></Field>
              <Field label="Lokasi/area"><input name="lokasi" defaultValue={t.lokasi ?? ""} className="input" /></Field>
              <Field label="Pekerjaan"><input name="keterangan" defaultValue={t.keterangan ?? ""} className="input" /></Field>
              <Field label="Alasan koreksi (wajib, tercatat)" className="col-span-2">
                <input name="alasan" required minLength={5} className="input" placeholder="mis. jam keluar salah ketik, sesuai form lembur ttd klien" />
              </Field>
              <p className="col-span-2 text-xs text-gray-500">Status tetap approved. Jam normal, lembur, dan konversi dihitung ulang otomatis; nilai lama dan baru tercatat di audit log.</p>
              <div className="col-span-2 flex justify-end">
                <SubmitButton confirm="Simpan koreksi timesheet yang sudah di-approve?">Simpan koreksi</SubmitButton>
              </div>
            </form>
          </Card>
        )}
      </div>

      <Card title="Riwayat perubahan" className="mt-4" bodyClass="">
        <ul className="divide-y divide-gray-100 text-sm">
          {((hist.data as any[]) ?? []).map((h) => (
            <li key={h.id} className="px-4 py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span><Badge tone={h.action === "INSERT" ? "green" : "blue"}>{h.action}</Badge> {uName.get(h.changed_by) ?? (h.changed_by ? "pengguna" : "sistem")}</span>
                <span className="text-xs text-gray-500">{tanggalWaktu(h.changed_at)}</span>
              </div>
              {h.action === "UPDATE" && (
                <div className="mt-1 text-xs text-gray-600">
                  {["status_kehadiran", "jam_masuk", "jam_keluar", "jam_konversi", "approval_status"]
                    .filter((k) => JSON.stringify(h.old_data?.[k]) !== JSON.stringify(h.new_data?.[k]))
                    .map((k) => (
                      <span key={k} className="mr-3">{k}: <s className="text-red-700">{String(h.old_data?.[k] ?? "∅")}</s> → <span className="text-emerald-700">{String(h.new_data?.[k] ?? "∅")}</span></span>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
