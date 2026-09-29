import { getMasters } from "@/lib/masters";
import { STATUS_KARYAWAN } from "@/lib/types";
import { Card, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AllowanceEditor, type AllowanceRow } from "./allowance-editor";
import { simpanKaryawan } from "./actions";

const T = ({ name, label, d, type = "text", req, className }: { name: string; label: string; d?: any; type?: string; req?: boolean; className?: string }) => (
  <Field label={label + (req ? " *" : "")} className={className}>
    <input name={name} type={type} defaultValue={d?.[name] ?? ""} required={req} className="input" />
  </Field>
);

export async function EmployeeForm({ emp, comp, allowances }: { emp?: any; comp?: any; allowances?: AllowanceRow[] }) {
  const m = await getMasters();
  return (
    <form action={simpanKaryawan} className="space-y-4">
      {emp?.id && <input type="hidden" name="id" value={emp.id} />}
      <Card title="Data pribadi">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <T name="nama" label="Nama lengkap" d={emp} req />
          <T name="no_ktp" label="No. KTP" d={emp} />
          <Field label="Jenis kelamin">
            <select name="jenis_kelamin" defaultValue={emp?.jenis_kelamin ?? ""} className="input">
              <option value="">-</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </Field>
          <T name="tempat_lahir" label="Tempat lahir" d={emp} />
          <T name="tanggal_lahir" label="Tanggal lahir" type="date" d={emp} />
          <T name="no_hp" label="No. HP" type="tel" d={emp} />
          <T name="email" label="Email" type="email" d={emp} />
          <T name="alamat_ktp" label="Alamat KTP" d={emp} className="sm:col-span-2 lg:col-span-3" />
          <T name="alamat_domisili" label="Alamat domisili / mess di Bontang" d={emp} className="sm:col-span-2 lg:col-span-3" />
          <T name="kontak_darurat_nama" label="Kontak darurat – nama" d={emp} />
          <T name="kontak_darurat_hubungan" label="Kontak darurat – hubungan" d={emp} />
          <T name="kontak_darurat_hp" label="Kontak darurat – No. HP" type="tel" d={emp} />
        </div>
      </Card>

      <Card title="Pekerjaan & kontrak">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Klasifikasi / jabatan">
            <select name="classification_id" defaultValue={emp?.classification_id ?? ""} className="input">
              <option value="">-</option>
              {m.classifications.filter((c) => c.aktif || c.id === emp?.classification_id).map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
            </select>
          </Field>
          <Field label="Area / disiplin">
            <select name="area_id" defaultValue={emp?.area_id ?? ""} className="input">
              <option value="">-</option>
              {m.areas.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
            </select>
          </Field>
          <Field label="Regu / supervisor">
            <select name="team_id" defaultValue={emp?.team_id ?? ""} className="input">
              <option value="">-</option>
              {m.teams.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
            </select>
          </Field>
          <T name="tanggal_masuk" label="Tanggal masuk" type="date" d={emp} req />
          <T name="tanggal_keluar" label="Tanggal selesai / PHK" type="date" d={emp} />
          <Field label="Status">
            <select name="status" defaultValue={emp?.status ?? "aktif"} className="input">
              {Object.entries(STATUS_KARYAWAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Jenis kontrak">
            <select name="jenis_kontrak" defaultValue={emp?.jenis_kontrak ?? "PKWT"} className="input">
              <option value="PKWT">PKWT</option>
              <option value="Harian">Harian</option>
            </select>
          </Field>
          <T name="no_kontrak" label="No. kontrak" d={emp} />
          <T name="tanggal_akhir_kontrak" label="Tanggal akhir PKWT" type="date" d={emp} />
        </div>
      </Card>

      <Card title="Gaji, tunjangan & rekening (rahasia – hanya Admin & karyawan ybs)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Basis gaji">
            <select name="basis_gaji" defaultValue={comp?.basis_gaji ?? "bulanan"} className="input">
              <option value="bulanan">Bulanan</option>
              <option value="harian">Harian (upah per hari)</option>
            </select>
          </Field>
          <T name="gaji_pokok" label="Gaji / upah pokok (Rp)" type="number" d={comp} />
          <Field label="Status PTKP (kategori TER PPh 21)">
            <select name="status_ptkp" defaultValue={comp?.status_ptkp ?? ""} className="input">
              <option value="">- (dianggap TK/0)</option>
              {["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <T name="npwp" label="NPWP" d={comp} />
          <T name="bank_nama" label="Bank" d={comp} />
          <T name="no_rekening" label="No. rekening" d={comp} />
          <T name="nama_rekening" label="Nama pemilik rekening" d={comp} />
        </div>
        <div className="mt-4">
          <div className="label">Tunjangan</div>
          <AllowanceEditor initial={allowances ?? []} />
        </div>
      </Card>

      <Card title="BPJS, MCU & APD">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <T name="no_bpjs_kesehatan" label="No. BPJS Kesehatan" d={emp} />
          <T name="no_bpjs_ketenagakerjaan" label="No. BPJS Ketenagakerjaan" d={emp} />
          <T name="mcu_tanggal" label="Tanggal MCU" type="date" d={emp} />
          <T name="mcu_berlaku_sampai" label="MCU berlaku sampai" type="date" d={emp} />
          <T name="ukuran_baju" label="Ukuran baju" d={emp} />
          <T name="ukuran_sepatu" label="Ukuran sepatu" d={emp} />
          <T name="catatan" label="Catatan" d={emp} className="sm:col-span-2 lg:col-span-3" />
        </div>
      </Card>

      {!emp?.id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="buat_akun" defaultChecked className="h-4 w-4" />
          Buatkan akun login karyawan (password awal ditampilkan sekali & wajib diganti saat login pertama)
        </label>
      )}
      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl border border-gray-200 bg-white/95 p-3 backdrop-blur lg:bottom-2">
        <SubmitButton>Simpan</SubmitButton>
      </div>
    </form>
  );
}
