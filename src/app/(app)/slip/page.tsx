import { getPerusahaan, getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMasters } from "@/lib/masters";
import { rupiah, tanggal } from "@/lib/format";
import { Card, DataTable, PageHeader } from "@/components/ui";
import { SlipButton } from "@/components/slip-button";

export const metadata = { title: "Slip gaji" };

export default async function SlipPage() {
  const s = await getSession();
  const supabase = await createClient();
  const perusahaan = await getPerusahaan();
  const m = await getMasters();
  const eid = s.profile.employee_id;
  if (!eid) return <p className="text-sm text-gray-600">Akun Anda tidak terhubung dengan data karyawan.</p>;
  const [e, c, slips] = await Promise.all([
    supabase.from("employees").select("nik, nama").eq("id", eid).single(),
    supabase.from("employee_compensation").select("bank_nama, no_rekening").eq("employee_id", eid).maybeSingle(),
    supabase.from("payroll").select("*, payroll_periods(nama, mulai, selesai)").eq("employee_id", eid).order("created_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title="Slip gaji saya" subtitle="Slip tersedia setelah periode payroll dikunci oleh Admin" />
      <Card bodyClass="">
        <DataTable
          rows={(slips.data as any[]) ?? []}
          rowKey={(r) => r.id}
          empty="Belum ada slip gaji."
          cols={[
            { key: "periode", label: "Periode", primary: true, render: (r) => <>{r.payroll_periods?.nama}<div className="text-xs text-gray-500">{tanggal(r.payroll_periods?.mulai)} – {tanggal(r.payroll_periods?.selesai)}</div></> },
            { key: "jam_konversi", label: "Jam konversi", num: true },
            { key: "upah_lembur", label: "Upah lembur", num: true, render: (r) => rupiah(r.upah_lembur) },
            { key: "take_home_pay", label: "Diterima", num: true, render: (r) => <b>{rupiah(r.take_home_pay)}</b> },
            {
              key: "pdf",
              label: "",
              render: (r) => (
                <SlipButton
                  payroll={r}
                  meta={{
                    perusahaan: perusahaan.nama,
                    periode: r.payroll_periods?.nama ?? "",
                    nama: e.data?.nama ?? "",
                    nik: e.data?.nik ?? "",
                    klasifikasi: m.cName.get(r.classification_id) ?? "-",
                    rekening: c.data?.no_rekening ? `${c.data.bank_nama ?? ""} ${c.data.no_rekening}` : "-",
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
