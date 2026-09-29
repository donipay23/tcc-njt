import { getSession, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hariIni, tambahHari } from "@/lib/format";
import { Flash, PageHeader } from "@/components/ui";
import { fetchAll } from "@/lib/fetch-all";
import { InputAbsensi, type Emp } from "./input-absensi";

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

  const teamIds = (teams ?? []).map((t) => t.id);
  const today = hariIni();
  const [emps, ts, hol] = await Promise.all([
    // Anggota SEMUA regu user: ikut ter-cache di HP sehingga bisa ganti regu saat offline
    teamIds.length
      ? fetchAll((a, b) => supabase.from("employees").select("id, nik, nama, status, team_id, classifications(nama)").in("team_id", teamIds).in("status", ["aktif", "cuti"]).order("nama").range(a, b))
      : Promise.resolve([] as any[]),
    regu ? supabase.from("timesheets").select("*").eq("tanggal", tanggal) : Promise.resolve({ data: [] as any[] }),
    // Rentang libur cukup lebar agar kalender tetap benar saat offline beberapa minggu
    supabase.from("holidays").select("tanggal, nama").gte("tanggal", tambahHari(tanggal < today ? tanggal : today, -90)).lte("tanggal", tambahHari(tanggal > today ? tanggal : today, 90)),
  ]);

  const roster: Record<string, Emp[]> = Object.fromEntries(teamIds.map((id) => [id, [] as Emp[]]));
  for (const e of emps as any[]) roster[e.team_id]?.push({ id: e.id, nik: e.nik, nama: e.nama, status: e.status, klasifikasi: e.classifications?.nama ?? "-" });
  const members = new Set((roster[regu ?? ""] ?? []).map((e) => e.id));
  const existing = Object.fromEntries(((ts.data as any[]) ?? []).filter((t) => members.has(t.employee_id)).map((t) => [t.employee_id, t]));
  return (
    <>
      <PageHeader title="Input absensi harian" subtitle="Pilih regu → centang hadir → isi jam → simpan. Jam lembur & konversi dihitung otomatis. Bisa dipakai tanpa sinyal; data dikirim saat online." />
      <Flash sp={sp} />
      {!teams?.length ? (
        <div className="card p-6 text-sm text-gray-600">Anda belum ditugaskan sebagai supervisor pada regu mana pun. Hubungi Admin.</div>
      ) : (
        <InputAbsensi
          key={`${regu}-${tanggal}`}
          tanggal={tanggal}
          regu={regu!}
          userId={s.userId}
          teams={teams}
          roster={roster}
          existing={existing}
          lembur={settings.lembur}
          holidays={((hol.data as any[]) ?? []).map((h) => ({ tanggal: h.tanggal, nama: h.nama }))}
        />
      )}
    </>
  );
}
