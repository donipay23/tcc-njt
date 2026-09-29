import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Pencil } from "lucide-react";
import { getPerusahaan, getSession, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMasters } from "@/lib/masters";
import { angka, hariIni, masaKerja, namaBulan, rupiah, selisihHari, tambahBulan, tanggal, tanggalWaktu } from "@/lib/format";
import { dasarUpahLembur } from "@/lib/calc/overtime";
import { HARI_KERJA_STANDAR } from "@/lib/calc/payroll";
import { ROLE_LABEL, STATUS_KARYAWAN } from "@/lib/types";
import { Badge, Card, DataTable, Field, Flash, Info, PageHeader, toneStatus } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SlipButton } from "@/components/slip-button";
import { FlashSecret } from "../flash-secret";
import { buatAkunKaryawan, hapusDokumen, hapusSertifikat, resetPasswordKaryawan, tambahSertifikat, ubahStatus, uploadDokumen } from "../actions";

export const metadata = { title: "Profil karyawan" };

function Expiry({ date }: { date?: string | null }) {
  if (!date) return <>-</>;
  const sisa = selisihHari(hariIni(), date);
  return (
    <span className={sisa < 0 ? "font-semibold text-red-700" : sisa <= 30 ? "font-semibold text-amber-700" : ""}>
      {tanggal(date)} {sisa < 0 ? "(kedaluwarsa)" : sisa <= 30 ? `(${sisa} hari lagi)` : ""}
    </span>
  );
}

export default async function Profil({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  const m = await getMasters();
  const settings = await getSettings();
  const perusahaan = await getPerusahaan();
  const today = hariIni();

  const { data: e } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (!e) notFound(); // RLS: tidak berhak = tidak ditemukan

  const [comp, allow, certs, docs, hist, ts, slips, prof] = await Promise.all([
    supabase.from("employee_compensation").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("employee_allowances").select("*").eq("employee_id", id).order("created_at"),
    supabase.from("employee_certificates").select("*").eq("employee_id", id).order("berlaku_sampai"),
    s.isAdmin ? supabase.from("employee_documents").select("*").eq("employee_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    supabase.from("employee_salary_history").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("timesheets").select("tanggal, jam_aktual, jam_normal, jam_lembur, jam_konversi, status_kehadiran, peringatan").eq("employee_id", id).gte("tanggal", tambahBulan(today, -6)).order("tanggal"),
    supabase.from("payroll").select("*, payroll_periods(nama, mulai, selesai)").eq("employee_id", id).order("created_at", { ascending: false }),
    s.isAdmin ? supabase.from("profiles").select("id, email, role, active, must_change_password").eq("employee_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // Signed URL dokumen (berlaku 10 menit)
  const docRows = await Promise.all(
    ((docs.data as any[]) ?? []).map(async (d) => {
      const { data } = await supabase.storage.from("dokumen").createSignedUrl(d.storage_path, 600);
      return { ...d, url: data?.signedUrl };
    }),
  );

  // Rekap lembur per bulan (6 bulan)
  const perBulan = new Map<string, { bulan: string; hadir: number; jam_aktual: number; jam_normal: number; jam_lembur: number; jam_konversi: number }>();
  for (const t of (ts.data as any[]) ?? []) {
    const k = t.tanggal.slice(0, 7);
    const r = perBulan.get(k) ?? { bulan: k, hadir: 0, jam_aktual: 0, jam_normal: 0, jam_lembur: 0, jam_konversi: 0 };
    if (t.status_kehadiran === "hadir" && Number(t.jam_aktual) > 0) r.hadir++;
    r.jam_aktual += Number(t.jam_aktual);
    r.jam_normal += Number(t.jam_normal);
    r.jam_lembur += Number(t.jam_lembur);
    r.jam_konversi += Number(t.jam_konversi);
    perBulan.set(k, r);
  }
  const rekap = [...perBulan.values()].reverse();

  const c = comp.data as any;
  const allowances = (allow.data as any[]) ?? [];
  const bolehLihatGaji = !!c; // RLS: hanya admin & karyawan ybs yang mendapat baris ini
  let upahJam: number | null = null;
  let dasarInfo = "";
  if (c) {
    const gp = c.basis_gaji === "harian" ? Number(c.gaji_pokok) * HARI_KERJA_STANDAR : Number(c.gaji_pokok);
    const sumA = (j: string) => allowances.filter((a) => a.jenis === j).reduce((x, a) => x + Number(a.jumlah) * (a.basis === "harian" ? HARI_KERJA_STANDAR : 1), 0);
    const d = dasarUpahLembur({ gaji_pokok: gp, tunjangan_tetap: sumA("tetap"), tunjangan_tidak_tetap: sumA("tidak_tetap") }, settings.lembur);
    upahJam = d.dasar / settings.lembur.pembagi_upah_jam;
    dasarInfo = `${rupiah(d.dasar)} (${d.metode}) ÷ ${settings.lembur.pembagi_upah_jam}`;
  }

  return (
    <>
      <PageHeader
        title={e.nama}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {e.nik} · {m.cName.get(e.classification_id) ?? "Tanpa klasifikasi"} · <Badge tone={toneStatus(e.status)}>{STATUS_KARYAWAN[e.status]}</Badge>
          </span>
        }
        actions={
          <>
            <Link href={`/absensi/kalender/${id}`} className="btn-secondary"><CalendarDays size={16} /> Kalender absensi</Link>
            {s.isAdmin && <Link href={`/karyawan/${id}/edit`} className="btn-primary"><Pencil size={16} /> Edit</Link>}
          </>
        }
      />
      <Flash sp={sp} />
      {s.isAdmin && <FlashSecret />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Data pribadi">
          <dl className="grid grid-cols-2 gap-3">
            <Info label="No. KTP" value={e.no_ktp} />
            <Info label="Jenis kelamin" value={e.jenis_kelamin === "L" ? "Laki-laki" : e.jenis_kelamin === "P" ? "Perempuan" : "-"} />
            <Info label="Tempat, tgl lahir" value={`${e.tempat_lahir ?? "-"}, ${tanggal(e.tanggal_lahir)}`} />
            <Info label="No. HP" value={e.no_hp} />
            <Info label="Email" value={e.email} />
            <Info label="Kontak darurat" value={e.kontak_darurat_nama ? `${e.kontak_darurat_nama} (${e.kontak_darurat_hubungan ?? "-"}) ${e.kontak_darurat_hp ?? ""}` : "-"} />
            <div className="col-span-2"><Info label="Alamat KTP" value={e.alamat_ktp} /></div>
            <div className="col-span-2"><Info label="Domisili / mess Bontang" value={e.alamat_domisili} /></div>
          </dl>
        </Card>
        <Card title="Pekerjaan & kontrak">
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Klasifikasi" value={m.cName.get(e.classification_id)} />
            <Info label="Area / disiplin" value={m.aName.get(e.area_id)} />
            <Info label="Regu" value={m.tName.get(e.team_id)} />
            <Info label="Tanggal masuk" value={tanggal(e.tanggal_masuk)} />
            <Info label="Masa kerja" value={masaKerja(e.tanggal_masuk, e.tanggal_keluar)} />
            <Info label="Tanggal keluar" value={tanggal(e.tanggal_keluar)} />
            <Info label="Jenis kontrak" value={`${e.jenis_kontrak}${e.no_kontrak ? ` · ${e.no_kontrak}` : ""}`} />
            <Info label="Akhir PKWT" value={<Expiry date={e.tanggal_akhir_kontrak} />} />
            <Info label="BPJS Kesehatan" value={e.no_bpjs_kesehatan} />
            <Info label="BPJS Ketenagakerjaan" value={e.no_bpjs_ketenagakerjaan} />
            <Info label="MCU" value={e.mcu_tanggal ? <>{tanggal(e.mcu_tanggal)} · s/d <Expiry date={e.mcu_berlaku_sampai} /></> : "-"} />
            <Info label="Ukuran APD" value={`Baju ${e.ukuran_baju ?? "-"} · Sepatu ${e.ukuran_sepatu ?? "-"}`} />
          </dl>
        </Card>

        {bolehLihatGaji && (
          <Card title="Gaji, tunjangan & rekening">
            <dl className="grid grid-cols-2 gap-3">
              <Info label={c.basis_gaji === "harian" ? "Upah pokok harian" : "Gaji pokok bulanan"} value={rupiah(c.gaji_pokok)} />
              <Info label="Upah per jam lembur" value={upahJam ? <span title={dasarInfo}>{rupiah(upahJam)}</span> : "-"} />
              <Info label="Bank / rekening" value={c.bank_nama ? `${c.bank_nama} ${c.no_rekening ?? ""} a.n. ${c.nama_rekening ?? "-"}` : "-"} />
              <Info label="NPWP / PTKP" value={`${c.npwp ?? "-"} / ${c.status_ptkp ?? "-"}`} />
            </dl>
            <p className="mt-2 text-xs text-gray-500">Dasar upah lembur: {dasarInfo}</p>
            {allowances.length > 0 && (
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {allowances.map((a) => (
                    <tr key={a.id} className="border-t border-gray-100">
                      <td className="py-1.5">{a.nama}</td>
                      <td className="py-1.5 text-xs text-gray-500">{a.jenis === "tetap" ? "Tetap" : "Tidak tetap"} · {a.basis === "harian" ? "per hari hadir" : "per bulan"}</td>
                      <td className="py-1.5 text-right tabular-nums">{rupiah(a.jumlah)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        <Card title="Sertifikat / lisensi">
          <DataTable
            rows={(certs.data as any[]) ?? []}
            rowKey={(r) => r.id}
            empty="Belum ada sertifikat."
            cols={[
              { key: "nama", label: "Nama", primary: true },
              { key: "nomor", label: "Nomor" },
              { key: "berlaku_sampai", label: "Berlaku s/d", render: (r) => <Expiry date={r.berlaku_sampai} /> },
              ...(s.isAdmin
                ? [{
                    key: "aksi",
                    label: "",
                    render: (r: any) => (
                      <form action={hapusSertifikat}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="employee_id" value={id} />
                        <SubmitButton className="btn-secondary btn-sm" confirm="Hapus sertifikat ini?">Hapus</SubmitButton>
                      </form>
                    ),
                  }]
                : []),
            ]}
          />
          {s.isAdmin && (
            <form action={tambahSertifikat} className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-4">
              <input type="hidden" name="employee_id" value={id} />
              <input name="nama" required className="input col-span-2 sm:col-span-1" placeholder="Nama sertifikat" />
              <input name="nomor" className="input" placeholder="Nomor" />
              <input name="berlaku_sampai" type="date" className="input" />
              <SubmitButton className="btn-secondary">Tambah</SubmitButton>
            </form>
          )}
        </Card>

        {s.isAdmin && (
          <Card title="Dokumen (akses terbatas Admin)">
            <DataTable
              rows={docRows}
              rowKey={(r) => r.id}
              empty="Belum ada dokumen."
              cols={[
                { key: "jenis", label: "Jenis", render: (r) => <Badge>{r.jenis}</Badge> },
                { key: "nama_file", label: "File", primary: true, render: (r) => (r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{r.nama_file}</a> : r.nama_file) },
                { key: "created_at", label: "Diunggah", render: (r) => tanggalWaktu(r.created_at) },
                {
                  key: "aksi",
                  label: "",
                  render: (r) => (
                    <form action={hapusDokumen}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="employee_id" value={id} />
                      <SubmitButton className="btn-secondary btn-sm" confirm="Hapus dokumen ini?">Hapus</SubmitButton>
                    </form>
                  ),
                },
              ]}
            />
            <form action={uploadDokumen} className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[1fr_2fr_auto]">
              <input type="hidden" name="employee_id" value={id} />
              <select name="jenis" className="input">
                {["foto", "ktp", "kk", "sertifikat", "kontrak", "mcu", "lainnya"].map((j) => <option key={j} value={j}>{j.toUpperCase()}</option>)}
              </select>
              <input name="file" type="file" required accept="image/*,application/pdf" capture="environment" className="input" />
              <SubmitButton className="btn-secondary col-span-2 sm:col-span-1">Unggah</SubmitButton>
            </form>
          </Card>
        )}
      </div>

      <Card title="Rekap jam kerja & lembur (6 bulan)" className="mt-4" bodyClass="">
        <DataTable
          rows={rekap}
          rowKey={(r) => r.bulan}
          cols={[
            { key: "bulan", label: "Bulan", primary: true, render: (r) => namaBulan(r.bulan + "-01", true) },
            { key: "hadir", label: "Hari hadir", num: true },
            { key: "jam_normal", label: "Jam normal", num: true, render: (r) => angka(r.jam_normal) },
            { key: "jam_lembur", label: "Lembur aktual", num: true, render: (r) => angka(r.jam_lembur) },
            { key: "jam_konversi", label: "Jam konversi", num: true, render: (r) => angka(r.jam_konversi) },
            ...(upahJam ? [{ key: "est", label: "Estimasi upah lembur", num: true, render: (r: any) => rupiah(Math.round(r.jam_konversi * upahJam!)) }] : []),
          ]}
        />
      </Card>

      {bolehLihatGaji && (
        <Card title="Slip gaji" className="mt-4" bodyClass="">
          <DataTable
            rows={(slips.data as any[]) ?? []}
            rowKey={(r) => r.id}
            empty="Belum ada slip gaji (slip tampil setelah periode payroll dikunci)."
            cols={[
              { key: "periode", label: "Periode", primary: true, render: (r) => r.payroll_periods?.nama },
              { key: "upah_lembur", label: "Upah lembur", num: true, render: (r) => rupiah(r.upah_lembur) },
              { key: "take_home_pay", label: "Take home pay", num: true, render: (r) => rupiah(r.take_home_pay) },
              {
                key: "pdf",
                label: "",
                render: (r) => (
                  <SlipButton
                    payroll={r}
                    meta={{
                      perusahaan: perusahaan.nama,
                      periode: r.payroll_periods?.nama ?? "",
                      nama: e.nama,
                      nik: e.nik,
                      klasifikasi: m.cName.get(r.classification_id) ?? "-",
                      rekening: c?.no_rekening ? `${c.bank_nama ?? ""} ${c.no_rekening}` : "-",
                    }}
                  />
                ),
              },
            ]}
          />
        </Card>
      )}

      {((hist.data as any[]) ?? []).length > 0 && (
        <Card title="Riwayat gaji & klasifikasi" className="mt-4" bodyClass="">
          <DataTable
            rows={hist.data as any[]}
            rowKey={(r) => r.id}
            cols={[
              { key: "created_at", label: "Tanggal", primary: true, render: (r) => tanggalWaktu(r.created_at) },
              { key: "keterangan", label: "Keterangan" },
              { key: "classification_id", label: "Klasifikasi", render: (r) => m.cName.get(r.classification_id) ?? "-" },
              { key: "gaji_pokok", label: "Gaji pokok", num: true, render: (r) => (r.gaji_pokok == null ? "-" : rupiah(r.gaji_pokok)) },
            ]}
          />
        </Card>
      )}

      {s.isAdmin && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Akun login">
            {prof.data ? (
              <div className="space-y-2 text-sm">
                <p>
                  Login: <b>{e.nik}</b> / <b>{(prof.data as any).email}</b>{e.no_hp ? <> / <b>{e.no_hp}</b></> : null}
                </p>
                <p>
                  Role: {ROLE_LABEL[(prof.data as any).role as keyof typeof ROLE_LABEL]} ·{" "}
                  {(prof.data as any).active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>}{" "}
                  {(prof.data as any).must_change_password && <Badge tone="amber">Belum ganti password awal</Badge>}
                </p>
                <form action={resetPasswordKaryawan}>
                  <input type="hidden" name="employee_id" value={id} />
                  <SubmitButton className="btn-secondary" confirm="Reset password karyawan ini?">Reset password</SubmitButton>
                </form>
              </div>
            ) : (
              <form action={buatAkunKaryawan} className="space-y-2 text-sm">
                <p className="text-gray-600">Karyawan belum memiliki akun login.</p>
                <input type="hidden" name="employee_id" value={id} />
                <SubmitButton>Buat akun login</SubmitButton>
              </form>
            )}
          </Card>
          <Card title="Ubah status karyawan">
            <form action={ubahStatus} className="grid grid-cols-2 items-end gap-2">
              <input type="hidden" name="employee_id" value={id} />
              <Field label="Status">
                <select name="status" defaultValue={e.status} className="input">
                  {Object.entries(STATUS_KARYAWAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Tanggal keluar (resign/selesai)">
                <input type="date" name="tanggal_keluar" defaultValue={e.tanggal_keluar ?? ""} className="input" />
              </Field>
              <SubmitButton className="btn-secondary col-span-2">Simpan status</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-gray-500">Status Resign / Selesai kontrak / Non-aktif otomatis menonaktifkan akun login karyawan.</p>
          </Card>
        </div>
      )}
    </>
  );
}
