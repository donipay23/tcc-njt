import { notFound } from "next/navigation";
import { AlertTriangle, Lock, LockOpen } from "lucide-react";
import { getPerusahaan, getSession, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getMasters } from "@/lib/masters";
import { angka, rupiah, tanggal, tanggalWaktu } from "@/lib/format";
import { Badge, Card, Flash, Kpi, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ExportButtons } from "@/components/export-buttons";
import { SlipButton } from "@/components/slip-button";
import { bukaPeriode, hitungPeriode, kunciPeriode, ubahPotongan } from "../actions";

export const metadata = { title: "Detail payroll" };

export default async function PayrollDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const s = await getSession();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const m = await getMasters();
  const perusahaan = await getPerusahaan();
  const { data: p } = await supabase.from("payroll_periods").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  const [rows, pending, emps, comps] = await Promise.all([
    fetchAll((a, b) => supabase.from("payroll").select("*").eq("period_id", id).range(a, b)),
    supabase.from("timesheets").select("id", { count: "exact", head: true }).gte("tanggal", p.mulai).lte("tanggal", p.selesai).in("approval_status", ["submitted", "draft", "rejected"]),
    fetchAll((a, b) => supabase.from("employees").select("id, nik, nama").range(a, b)),
    fetchAll((a, b) => supabase.from("employee_compensation").select("employee_id, bank_nama, no_rekening, nama_rekening").range(a, b)),
  ]);
  const eMap = new Map((emps as any[]).map((e) => [e.id, e]));
  const cMap = new Map((comps as any[]).map((c) => [c.employee_id, c]));
  const data = (rows as any[])
    .map((r) => {
      const e = eMap.get(r.employee_id) ?? {};
      const c = cMap.get(r.employee_id) ?? {};
      return {
        ...r,
        nama: e.nama,
        nik: e.nik,
        klasifikasi: m.cName.get(r.classification_id) ?? "-",
        regu: m.tName.get(r.team_id) ?? "-",
        bank: c.bank_nama ?? "",
        rekening: c.no_rekening ?? "",
        nama_rekening: c.nama_rekening ?? "",
        tunjangan: Number(r.tunjangan_tetap) + Number(r.tunjangan_tidak_tetap),
        bpjs_kes_p: r.bpjs_perusahaan?.kes, bpjs_jkk: r.bpjs_perusahaan?.jkk, bpjs_jkm: r.bpjs_perusahaan?.jkm,
        bpjs_jht_p: r.bpjs_perusahaan?.jht, bpjs_jp_p: r.bpjs_perusahaan?.jp,
      };
    })
    .sort((a, b) => (a.nama ?? "").localeCompare(b.nama ?? ""));
  const sum = (k: string) => data.reduce((a, r) => a + Number(r[k] || 0), 0);
  const locked = p.status === "locked";

  return (
    <>
      <PageHeader
        title={`Payroll ${p.nama}`}
        subtitle={<>{tanggal(p.mulai)} – {tanggal(p.selesai)} · {locked ? <Badge tone="green">Terkunci {tanggalWaktu(p.locked_at)}</Badge> : <Badge tone="amber">Terbuka</Badge>}</>}
        actions={
          <>
            {!locked && (
              <form action={hitungPeriode}>
                <input type="hidden" name="period_id" value={id} />
                <SubmitButton>{data.length ? "Hitung ulang" : "Hitung payroll"}</SubmitButton>
              </form>
            )}
            {!locked && data.length > 0 && (
              <form action={kunciPeriode}>
                <input type="hidden" name="period_id" value={id} />
                <SubmitButton className="btn-secondary" confirm="Kunci periode? Snapshot payroll & timesheet periode ini tidak bisa diubah lagi (kecuali Super Admin).">
                  <Lock size={16} /> Kunci periode
                </SubmitButton>
              </form>
            )}
            {locked && s.isSuperAdmin && (
              <form action={bukaPeriode}>
                <input type="hidden" name="period_id" value={id} />
                <SubmitButton className="btn-secondary" confirm="Buka kembali periode terkunci?"><LockOpen size={16} /> Buka kunci</SubmitButton>
              </form>
            )}
            <ExportButtons
              filename={`payroll-${p.nama}`}
              judul={`Payroll ${p.nama}`}
              subjudul={`${tanggal(p.mulai)} – ${tanggal(p.selesai)}`}
              pdf={false}
              cols={[
                { key: "nik", label: "NIK" }, { key: "nama", label: "Nama" }, { key: "klasifikasi", label: "Klasifikasi" }, { key: "regu", label: "Regu" },
                { key: "hari_hadir", label: "Hari hadir", type: "angka" }, { key: "jam_normal", label: "Jam normal", type: "angka" },
                { key: "jam_lembur", label: "Jam lembur", type: "angka" }, { key: "jam_konversi", label: "Jam konversi", type: "angka" },
                { key: "faktor_prorata", label: "Faktor prorata", type: "angka" }, { key: "gaji_pokok", label: "Gaji pokok", type: "rupiah" },
                { key: "tunjangan_tetap", label: "Tunj. tetap", type: "rupiah" }, { key: "tunjangan_tidak_tetap", label: "Tunj. tidak tetap", type: "rupiah" },
                { key: "upah_per_jam", label: "Upah/jam", type: "rupiah" }, { key: "upah_lembur", label: "Upah lembur", type: "rupiah" },
                { key: "bruto", label: "Bruto", type: "rupiah" },
                { key: "bpjs_kes_p", label: "BPJS Kes (P)", type: "rupiah" }, { key: "bpjs_jkk", label: "JKK", type: "rupiah" }, { key: "bpjs_jkm", label: "JKM", type: "rupiah" },
                { key: "bpjs_jht_p", label: "JHT (P)", type: "rupiah" }, { key: "bpjs_jp_p", label: "JP (P)", type: "rupiah" },
                { key: "bpjs_karyawan_total", label: "BPJS karyawan", type: "rupiah" }, { key: "thr_cadangan", label: "Cadangan THR", type: "rupiah" },
                { key: "kompensasi_cadangan", label: "Cadangan kompensasi PKWT", type: "rupiah" }, { key: "pph21", label: "PPh 21", type: "rupiah" },
                { key: "potongan_lain", label: "Potongan lain", type: "rupiah" }, { key: "take_home_pay", label: "Take home pay", type: "rupiah" },
                { key: "biaya_perusahaan", label: "Biaya perusahaan", type: "rupiah" },
              ]}
              rows={data}
              extraSheets={[{
                name: "Transfer bank",
                cols: [{ key: "nama", label: "Nama" }, { key: "bank", label: "Bank" }, { key: "rekening", label: "No. rekening" }, { key: "nama_rekening", label: "Nama rekening" }, { key: "take_home_pay", label: "Jumlah transfer", type: "rupiah" }],
                rows: data,
              }]}
            />
          </>
        }
      />
      <Flash sp={sp} />
      {(pending.count ?? 0) > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} /> {pending.count} timesheet di periode ini belum di-approve dan TIDAK ikut dihitung. Approve dulu di menu Approval.
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Karyawan" value={data.length} />
        <Kpi label="Gaji + tunjangan" value={rupiah(sum("gaji_pokok") + sum("tunjangan"))} />
        <Kpi label="Upah lembur" value={rupiah(sum("upah_lembur"))} hint={`${angka(sum("jam_konversi"))} jam konversi`} />
        <Kpi label="BPJS perusahaan" value={rupiah(sum("bpjs_perusahaan_total"))} />
        <Kpi label="Total transfer (THP)" value={rupiah(sum("take_home_pay"))} />
        <Kpi label="Total biaya perusahaan" value={rupiah(sum("biaya_perusahaan"))} hint="incl. cadangan THR & kompensasi" />
      </div>
      <Card bodyClass="" title="Rincian per karyawan">
        {!data.length ? (
          <p className="p-6 text-center text-sm text-gray-500">Belum dihitung. Klik “Hitung payroll”.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="th">Karyawan</th>
                  <th className="th num">Hadir</th>
                  <th className="th num">Konversi</th>
                  <th className="th num">Gaji pokok</th>
                  <th className="th num">Tunjangan</th>
                  <th className="th num">Lembur</th>
                  <th className="th num">BPJS (P / K)</th>
                  <th className="th num">THR + Komp.</th>
                  <th className="th">PPh 21 / Potongan</th>
                  <th className="th num">THP</th>
                  <th className="th num">Biaya</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="td">{r.nama}<div className="text-xs text-gray-500">{r.nik} · {r.klasifikasi}{Number(r.faktor_prorata) < 1 ? ` · prorata ${angka(Number(r.faktor_prorata) * 100)}%` : ""}</div></td>
                    <td className="td num">{r.hari_hadir}</td>
                    <td className="td num">{angka(r.jam_konversi)}</td>
                    <td className="td num">{rupiah(r.gaji_pokok)}</td>
                    <td className="td num">{rupiah(r.tunjangan)}</td>
                    <td className="td num">{rupiah(r.upah_lembur)}<div className="text-xs text-gray-500">{rupiah(r.upah_per_jam)}/j</div></td>
                    <td className="td num">{rupiah(r.bpjs_perusahaan_total)}<div className="text-xs text-gray-500">{rupiah(r.bpjs_karyawan_total)}</div></td>
                    <td className="td num">{rupiah(Number(r.thr_cadangan) + Number(r.kompensasi_cadangan))}</td>
                    <td className="td">
                      {locked ? (
                        <span className="text-xs">{rupiah(r.pph21)} / {rupiah(r.potongan_lain)}</span>
                      ) : (
                        <form action={ubahPotongan} className="flex gap-1">
                          <input type="hidden" name="period_id" value={id} />
                          <input type="hidden" name="id" value={r.id} />
                          <input name="pph21" type="number" defaultValue={Number(r.pph21) || ""} placeholder="PPh21" className="input w-24 px-2 py-1 text-xs" />
                          <input name="potongan_lain" type="number" defaultValue={Number(r.potongan_lain) || ""} placeholder="Kasbon" className="input w-24 px-2 py-1 text-xs" />
                          <input name="potongan_keterangan" defaultValue={r.potongan_keterangan ?? ""} placeholder="Ket." className="input w-24 px-2 py-1 text-xs" />
                          <SubmitButton className="btn-secondary btn-sm">OK</SubmitButton>
                        </form>
                      )}
                    </td>
                    <td className="td num font-semibold">{rupiah(r.take_home_pay)}</td>
                    <td className="td num">{rupiah(r.biaya_perusahaan)}</td>
                    <td className="td">
                      <SlipButton
                        label="Slip"
                        payroll={r}
                        meta={{ perusahaan: perusahaan.nama, periode: p.nama, nama: r.nama, nik: r.nik, klasifikasi: r.klasifikasi, rekening: r.rekening ? `${r.bank} ${r.rekening}` : "-" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-gray-500">
        PPh 21 diisi manual per karyawan (mode diatur di Pengaturan: tidak dihitung / ditanggung perusahaan / dipotong karyawan). Hanya timesheet berstatus approved yang dihitung. Setelah dikunci, angka menjadi snapshot dan tidak berubah walau gaji/rate diubah kemudian.
      </p>
    </>
  );
}
