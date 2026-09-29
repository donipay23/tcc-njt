import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPerusahaan, getSettings, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hariIni, tanggal } from "@/lib/format";
import type { Tier } from "@/lib/calc/settings";
import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Pengaturan" };

const pct = (f: FormData, k: string) => (Number(String(f.get(k)).replace(",", ".")) || 0) / 100;
const n = (f: FormData, k: string) => Number(String(f.get(k)).replace(",", ".")) || 0;

function parseTiers(s: string): Tier[] {
  // format: "1:1.5, *:2" → sampai jam ke-1 ×1,5; sisanya ×2
  const tiers = s.split(",").map((p) => {
    const [a, b] = p.split(":").map((x) => x.trim());
    return { sampai: a === "*" ? null : Number(a), pengali: Number(b.replace(",", ".")) };
  });
  if (tiers.some((t) => !(t.pengali > 0) || (t.sampai != null && !(t.sampai > 0)))) throw new Error("Format pengali tidak valid");
  return tiers;
}
const tiersText = (t: Tier[]) => t.map((x) => `${x.sampai ?? "*"}:${x.pengali}`).join(", ");

async function simpan(form: FormData) {
  "use server";
  await requireRole("super_admin");
  const supabase = await createClient();
  const group = String(form.get("group"));
  const s0 = await getSettings();
  let rows: { key: string; value: unknown }[] = [];
  try {
    if (group === "lembur") {
      rows = [{
        key: "lembur",
        value: {
          pembagi_upah_jam: n(form, "pembagi_upah_jam"),
          jam_normal_harian: n(form, "jam_normal_harian"),
          pengali_hari_kerja: parseTiers(String(form.get("pengali_hari_kerja"))),
          pengali_hari_libur: parseTiers(String(form.get("pengali_hari_libur"))),
          jam_istirahat: String(form.get("jam_istirahat")).split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
            const [mulai, selesai] = x.split("-").map((y) => y.trim());
            if (!/^\d{2}:\d{2}$/.test(mulai) || !/^\d{2}:\d{2}$/.test(selesai)) throw new Error("Format jam istirahat: 12:00-13:00");
            return { mulai, selesai };
          }),
          hari_kerja: form.getAll("hari_kerja").map(Number),
          batas_lembur_harian: n(form, "batas_lembur_harian"),
          batas_lembur_mingguan: n(form, "batas_lembur_mingguan"),
          batas_jam_kerja_harian: n(form, "batas_jam_kerja_harian"),
          rasio_upah_tetap_minimum: pct(form, "rasio_upah_tetap_minimum"),
        },
      }];
    } else if (group === "bpjs") {
      rows = [{
        key: "bpjs",
        value: {
          kes_perusahaan: pct(form, "kes_perusahaan"), kes_karyawan: pct(form, "kes_karyawan"), kes_batas_upah: n(form, "kes_batas_upah"),
          jkk: pct(form, "jkk"), jkm: pct(form, "jkm"), jht_perusahaan: pct(form, "jht_perusahaan"), jht_karyawan: pct(form, "jht_karyawan"),
          jp_perusahaan: pct(form, "jp_perusahaan"), jp_karyawan: pct(form, "jp_karyawan"), jp_batas_upah: n(form, "jp_batas_upah"),
        },
      }];
    } else if (group === "payroll") {
      rows = [
        {
          key: "payroll",
          value: {
            prorata_metode: String(form.get("prorata_metode")),
            prorata_pembagi_hari_kerja: form.get("prorata_pembagi_hari_kerja") ? n(form, "prorata_pembagi_hari_kerja") : null,
            thr_cadangan: form.get("thr_cadangan") === "on",
            kompensasi_pkwt_cadangan: form.get("kompensasi_pkwt_cadangan") === "on",
            pph21_mode: String(form.get("pph21_mode")),
          },
        },
        { key: "periode", value: { tanggal_mulai: Math.min(28, Math.max(1, n(form, "tanggal_mulai"))) } },
      ];
    } else if (group === "pajak") {
      rows = [
        { key: "pajak", value: { ppn_tarif: pct(form, "ppn_tarif"), ppn_dpp_faktor: pct(form, "ppn_dpp_faktor"), pph23_tarif: pct(form, "pph23_tarif"), termin_hari: n(form, "termin_hari") } },
        { key: "target_margin", value: pct(form, "target_margin") },
        { key: "admin_akses_keuangan", value: form.get("admin_akses_keuangan") === "on" },
      ];
    } else if (group === "pph21") {
      rows = [{
        key: "pph21",
        value: {
          ...(s0.raw.pph21 ?? {}),
          ptkp_dasar: n(form, "ptkp_dasar"),
          ptkp_kawin: n(form, "ptkp_kawin"),
          ptkp_tanggungan: n(form, "ptkp_tanggungan"),
          biaya_jabatan_persen: pct(form, "biaya_jabatan_persen"),
          biaya_jabatan_maks_bulan: n(form, "biaya_jabatan_maks_bulan"),
        },
      }];
    } else if (group === "perusahaan") {
      rows = [{ key: "perusahaan", value: { nama: form.get("nama"), klien: form.get("klien"), no_kontrak: form.get("no_kontrak"), domain_email_karyawan: form.get("domain_email_karyawan") } }];
    }
  } catch (e) {
    redirect(`/pengaturan?err=${encodeURIComponent((e as Error).message)}`);
  }
  const { error } = await supabase.from("settings").upsert(rows);
  redirect(`/pengaturan?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Pengaturan disimpan (tercatat di audit log)")}#${group}`);
}

async function tambahLibur(form: FormData) {
  "use server";
  await requireRole("super_admin");
  const supabase = await createClient();
  const lines = String(form.get("data") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => {
    const [tgl, nama, jenis] = l.split(/[;\t]/).map((x) => x?.trim());
    const m = tgl?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : tgl;
    return { tanggal: iso, nama: nama || "Libur", jenis: jenis?.toLowerCase().includes("cuti") ? "cuti_bersama" : "libur_nasional" };
  });
  if (rows.some((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.tanggal))) redirect("/pengaturan?err=Format+tanggal+libur+tidak+valid#libur");
  const { error } = await supabase.from("holidays").upsert(rows);
  redirect(`/pengaturan?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? `${rows.length} hari libur disimpan. Timesheet yang sudah ada tidak dihitung ulang otomatis.`)}#libur`);
}

async function hapusLibur(form: FormData) {
  "use server";
  await requireRole("super_admin");
  const supabase = await createClient();
  await supabase.from("holidays").delete().eq("tanggal", String(form.get("tanggal")));
  revalidatePath("/pengaturan");
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default async function Pengaturan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin");
  const sp = await searchParams;
  const s = await getSettings();
  const p = await getPerusahaan();
  const supabase = await createClient();
  const tahun = Number(sp.tahun) || Number(hariIni().slice(0, 4));
  const { data: hol } = await supabase.from("holidays").select("*").gte("tanggal", `${tahun}-01-01`).lte("tanggal", `${tahun}-12-31`).order("tanggal");
  const L = s.lembur;
  const B = s.bpjs;
  const x100 = (v: number) => +(v * 100).toFixed(4);
  const Num = ({ name, label, v, step = "any" }: { name: string; label: string; v: number | string; step?: string }) => (
    <Field label={label}><input name={name} type="number" step={step} defaultValue={v} className="input" /></Field>
  );

  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Seluruh angka perhitungan disimpan di database (bukan hard-code) dan setiap perubahan tercatat di audit log." />
      <Flash sp={sp} />
      <div className="space-y-4">
        <Card title="Identitas proyek">
          <form action={simpan} id="perusahaan" className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
            <input type="hidden" name="group" value="perusahaan" />
            <Field label="Nama perusahaan kontraktor"><input name="nama" defaultValue={p.nama} className="input" /></Field>
            <Field label="Klien / main contractor"><input name="klien" defaultValue={p.klien} className="input" /></Field>
            <Field label="No. kontrak / PO"><input name="no_kontrak" defaultValue={p.no_kontrak} className="input" /></Field>
            <Field label="Domain email sintetis karyawan"><input name="domain_email_karyawan" defaultValue={p.domain_email_karyawan} className="input" /></Field>
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>

        <Card title="Aturan jam kerja & lembur (KEP-102/MEN/VI/2004 jo. PP 35/2021)">
          <form action={simpan} id="lembur" className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
            <input type="hidden" name="group" value="lembur" />
            <Num name="pembagi_upah_jam" label="Pembagi upah per jam" v={L.pembagi_upah_jam} />
            <Num name="jam_normal_harian" label="Jam normal per hari" v={L.jam_normal_harian} />
            <Field label="Jam istirahat (tidak dihitung)"><input name="jam_istirahat" defaultValue={L.jam_istirahat.map((b) => `${b.mulai}-${b.selesai}`).join(", ")} className="input" /></Field>
            <Num name="rasio_upah_tetap_minimum" label="Ambang upah tetap (%)" v={x100(L.rasio_upah_tetap_minimum)} />
            <Field label="Pengali hari kerja (jam lembur ke-…:pengali)" className="col-span-2"><input name="pengali_hari_kerja" defaultValue={tiersText(L.pengali_hari_kerja)} className="input font-mono" /></Field>
            <Field label="Pengali hari libur (jam kerja ke-…:pengali)" className="col-span-2"><input name="pengali_hari_libur" defaultValue={tiersText(L.pengali_hari_libur)} className="input font-mono" /></Field>
            <Num name="batas_lembur_harian" label="Batas lembur / hari" v={L.batas_lembur_harian} />
            <Num name="batas_lembur_mingguan" label="Batas lembur / minggu" v={L.batas_lembur_mingguan} />
            <Num name="batas_jam_kerja_harian" label="Peringatan jam kerja > (jam)" v={L.batas_jam_kerja_harian} />
            <div>
              <span className="label">Hari kerja</span>
              <div className="flex flex-wrap gap-2 text-sm">
                {HARI.map((h, i) => (
                  <label key={i} className="flex items-center gap-1"><input type="checkbox" name="hari_kerja" value={i} defaultChecked={L.hari_kerja.includes(i)} />{h}</label>
                ))}
              </div>
            </div>
            <p className="col-span-2 text-xs text-gray-500 md:col-span-3">
              Format pengali: <code>1:1.5, *:2</code> = jam ke-1 ×1,5, jam berikutnya ×2. Hari libur <code>8:2, 9:3, *:4</code> = jam 1–8 ×2, jam ke-9 ×3, jam ke-10 dst ×4. Perubahan berlaku untuk timesheet yang diinput/diubah setelahnya; periode terkunci tidak berubah.
            </p>
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>

        <Card title="BPJS (porsi perusahaan & karyawan)">
          <form action={simpan} id="bpjs" className="grid grid-cols-2 items-end gap-3 md:grid-cols-5">
            <input type="hidden" name="group" value="bpjs" />
            <Num name="kes_perusahaan" label="Kesehatan – perusahaan (%)" v={x100(B.kes_perusahaan)} />
            <Num name="kes_karyawan" label="Kesehatan – karyawan (%)" v={x100(B.kes_karyawan)} />
            <Num name="kes_batas_upah" label="Batas upah Kesehatan (Rp)" v={B.kes_batas_upah} />
            <Num name="jkk" label="JKK (%) – sesuai risiko" v={x100(B.jkk)} />
            <Num name="jkm" label="JKM (%)" v={x100(B.jkm)} />
            <Num name="jht_perusahaan" label="JHT – perusahaan (%)" v={x100(B.jht_perusahaan)} />
            <Num name="jht_karyawan" label="JHT – karyawan (%)" v={x100(B.jht_karyawan)} />
            <Num name="jp_perusahaan" label="JP – perusahaan (%)" v={x100(B.jp_perusahaan)} />
            <Num name="jp_karyawan" label="JP – karyawan (%)" v={x100(B.jp_karyawan)} />
            <Num name="jp_batas_upah" label="Batas upah JP (Rp)" v={B.jp_batas_upah} />
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>

        <Card title="Payroll & periode cut-off">
          <form action={simpan} id="payroll" className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
            <input type="hidden" name="group" value="payroll" />
            <Num name="tanggal_mulai" label="Periode mulai tanggal (1 atau mis. 21)" v={p.tanggal_mulai_periode} step="1" />
            <Field label="Metode prorata">
              <select name="prorata_metode" defaultValue={s.payroll.prorata_metode} className="input">
                <option value="kalender_30">Hari kalender / 30</option>
                <option value="hari_kerja">Hari kerja</option>
              </select>
            </Field>
            <Num name="prorata_pembagi_hari_kerja" label="Pembagi hari kerja (kosong = aktual)" v={s.payroll.prorata_pembagi_hari_kerja ?? ""} />
            <Field label="PPh 21">
              <select name="pph21_mode" defaultValue={s.payroll.pph21_mode} className="input">
                <option value="tidak_dihitung">Tidak dihitung</option>
                <option value="ditanggung_perusahaan">Ditanggung perusahaan</option>
                <option value="dipotong_karyawan">Dipotong dari karyawan</option>
                <option value="gross_up">Gross-up (tunjangan PPh)</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="thr_cadangan" defaultChecked={s.payroll.thr_cadangan} /> Cadangan THR (1/12 upah)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="kompensasi_pkwt_cadangan" defaultChecked={s.payroll.kompensasi_pkwt_cadangan} /> Cadangan kompensasi PKWT</label>
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>

        <Card title="PPh 21 (TER PP 58/2023 & PMK 168/2023)">
          <form action={simpan} id="pph21" className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
            <input type="hidden" name="group" value="pph21" />
            <Num name="ptkp_dasar" label="PTKP wajib pajak (Rp/th)" v={s.pph21.ptkp_dasar} />
            <Num name="ptkp_kawin" label="Tambahan kawin (Rp/th)" v={s.pph21.ptkp_kawin} />
            <Num name="ptkp_tanggungan" label="Per tanggungan, maks. 3 (Rp/th)" v={s.pph21.ptkp_tanggungan} />
            <Num name="biaya_jabatan_persen" label="Biaya jabatan (%)" v={x100(s.pph21.biaya_jabatan_persen)} />
            <Num name="biaya_jabatan_maks_bulan" label="Maks. biaya jabatan / bulan" v={s.pph21.biaya_jabatan_maks_bulan} />
            <SubmitButton>Simpan</SubmitButton>
            <p className="col-span-2 text-xs text-gray-500 md:col-span-6">
              Jan–Nov: TER bulanan × bruto (kategori A: TK/0, TK/1, K/0 · B: TK/2, TK/3, K/1, K/2 · C: K/3). Desember atau bulan terakhir bekerja: PPh setahun
              tarif Pasal 17 atas PKP dikurangi PPh yang sudah dipotong. Bruto termasuk premi BPJS Kesehatan, JKK & JKM yang dibayar perusahaan; iuran JHT & JP
              karyawan menjadi pengurang. Tabel TER ({s.pph21.ter.A.length}/{s.pph21.ter.B.length}/{s.pph21.ter.C.length} lapisan) dan lapisan Pasal 17 tersimpan di
              pengaturan <code>pph21</code> dan dapat diperbarui bila regulasi berubah.
            </p>
          </form>
        </Card>

        <Card title="Pajak, termin & akses keuangan">
          <form action={simpan} id="pajak" className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
            <input type="hidden" name="group" value="pajak" />
            <Num name="ppn_tarif" label="Tarif PPN (%)" v={x100(s.pajak.ppn_tarif)} />
            <Num name="ppn_dpp_faktor" label="DPP nilai lain (% subtotal)" v={x100(s.pajak.ppn_dpp_faktor)} />
            <Num name="pph23_tarif" label="PPh 23 dipotong klien (%)" v={x100(s.pajak.pph23_tarif)} />
            <Num name="termin_hari" label="Termin pembayaran (hari)" v={s.pajak.termin_hari} step="1" />
            <Num name="target_margin" label="Target margin (%)" v={x100(s.target_margin)} />
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="admin_akses_keuangan" defaultChecked={s.admin_akses_keuangan} /> Admin boleh melihat invoice, profit & arus kas</label>
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>

        <Card title={`Hari libur nasional & cuti bersama ${tahun}`} actions={<form method="get" className="flex gap-1"><input name="tahun" type="number" defaultValue={tahun} className="input w-24 py-1" /><button className="btn-secondary btn-sm">Lihat</button></form>}>
          <div id="libur" className="grid gap-4 lg:grid-cols-2">
            <ul className="divide-y divide-gray-100 text-sm">
              {((hol as any[]) ?? []).map((h) => (
                <li key={h.tanggal} className="flex items-center justify-between py-1.5">
                  <span>{tanggal(h.tanggal)} · {h.nama} {h.jenis === "cuti_bersama" && <span className="text-xs text-gray-500">(cuti bersama)</span>}</span>
                  <form action={hapusLibur}><input type="hidden" name="tanggal" value={h.tanggal} /><SubmitButton className="text-xs text-red-600 hover:underline">hapus</SubmitButton></form>
                </li>
              ))}
              {!hol?.length && <li className="py-2 text-gray-500">Belum ada data.</li>}
            </ul>
            <form action={tambahLibur} className="space-y-2">
              <Field label="Tambah / import (satu baris per tanggal: DD/MM/YYYY;Nama;cuti bersama)">
                <textarea name="data" rows={6} className="input font-mono text-xs" placeholder={"17/08/2026;Hari Kemerdekaan RI\n24/12/2026;Cuti bersama Natal;cuti bersama"} />
              </Field>
              <p className="text-xs text-gray-500">Bisa copy-paste 2 kolom dari Excel (tanggal & nama, dipisah tab). Sumber: SKB 3 Menteri tahun berjalan.</p>
              <SubmitButton className="btn-secondary">Simpan hari libur</SubmitButton>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
