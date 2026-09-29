import { getSession, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hariIni, tambahHari } from "@/lib/format";
import { Flash, PageHeader } from "@/components/ui";
import { InputAbsensi } from "./input-absensi";

export const metadata = { title: "Input absensi" };

export default async function InputPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (!["super_admin", "admin", "supervisor"].includes(s.role)) return <p>Tidak ada akses.</p>;
  const supabase = await createClient();
  const settings = await getSettings();
  const tanggal = sp.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(sp.tanggal) ? sp.tanggal : hariIni();

  let tq = supabase.from("teams").select("id, nama").order("nama");
  if (s.role === "supervisor") tq = tq.eq("supervisor_id", s.userId);
  const { data: teams } = await tq;
  const regu = sp.regu && teams?.some((t) => t.id === sp.regu) ? sp.regu : teams?.[0]?.id;

  const [emps, ts, hol] = await Promise.all([
    regu
      ? supabase.from("employees").select("id, nik, nama, status, classification_id, classifications(nama)").eq("team_id", regu).in("status", ["aktif", "cuti"]).order("nama")
      : Promise.resolve({ data: [] as any[] }),
    regu ? supabase.from("timesheets").select("*").eq("tanggal", tanggal) : Promise.resolve({ data: [] as any[] }),
    supabase.from("holidays").select("tanggal, nama").gte("tanggal", tambahHari(tanggal, -7)).lte("tanggal", tambahHari(tanggal, 7)),
  ]);

  const existing = Object.fromEntries(((ts.data as any[]) ?? []).map((t) => [t.employee_id, t]));
  return (
    <>
      <PageHeader title="Input absensi harian" subtitle="Pilih regu → centang hadir → isi jam → simpan. Jam lembur & konversi dihitung otomatis." />
      <Flash sp={sp} />
      {!teams?.length ? (
        <div className="card p-6 text-sm text-gray-600">Anda belum ditugaskan sebagai supervisor pada regu mana pun. Hubungi Admin.</div>
      ) : (
        <InputAbsensi
          key={`${regu}-${tanggal}`}
          tanggal={tanggal}
          regu={regu!}
          teams={teams}
          employees={((emps.data as any[]) ?? []).map((e) => ({ id: e.id, nik: e.nik, nama: e.nama, status: e.status, klasifikasi: e.classifications?.nama ?? "-" }))}
          existing={existing}
          lembur={settings.lembur}
          holidays={((hol.data as any[]) ?? []).map((h) => h.tanggal)}
          namaLibur={((hol.data as any[]) ?? []).find((h) => h.tanggal === tanggal)?.nama ?? null}
        />
      )}
    </>
  );
}
