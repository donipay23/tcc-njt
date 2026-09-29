import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hariIni, rupiah, tanggal } from "@/lib/format";
import { rateBerlaku } from "@/lib/calc/invoice";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Klasifikasi & rate" };

async function tambahKlasifikasi(form: FormData) {
  "use server";
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const { error } = await supabase.from("classifications").insert({ kode: String(form.get("kode")).trim().toUpperCase(), nama: String(form.get("nama")).trim() });
  redirect(`/klasifikasi?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Klasifikasi ditambahkan")}`);
}

async function tambahRate(form: FormData) {
  "use server";
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const { error } = await supabase.from("classification_rates").upsert(
    {
      classification_id: String(form.get("classification_id")),
      rate_per_jam: Number(form.get("rate_per_jam")) || 0,
      berlaku_mulai: String(form.get("berlaku_mulai")),
      keterangan: String(form.get("keterangan") ?? "") || null,
    },
    { onConflict: "classification_id,berlaku_mulai" },
  );
  redirect(`/klasifikasi?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Rate disimpan (histori tetap tersimpan)")}`);
}

async function toggleAktif(form: FormData) {
  "use server";
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  await supabase.from("classifications").update({ aktif: form.get("aktif") === "true" }).eq("id", String(form.get("id")));
  revalidatePath("/klasifikasi");
}

async function hapusRate(form: FormData) {
  "use server";
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  await supabase.from("classification_rates").delete().eq("id", String(form.get("id")));
  revalidatePath("/klasifikasi");
}

export default async function Klasifikasi({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = hariIni();
  const [c, r, e] = await Promise.all([
    supabase.from("classifications").select("*").order("nama"),
    supabase.from("classification_rates").select("*").order("berlaku_mulai", { ascending: false }),
    supabase.from("employees").select("classification_id").eq("status", "aktif").limit(100000),
  ]);
  const rates = (r.data as any[]) ?? [];
  const count = new Map<string, number>();
  for (const x of (e.data as any[]) ?? []) count.set(x.classification_id, (count.get(x.classification_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Klasifikasi & rate tagihan" subtitle="Rate per jam ke klien dengan tanggal efektif — perubahan rate (adendum) tidak mengubah tagihan lama." />
      <Flash sp={sp} />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Tambah klasifikasi">
          <form action={tambahKlasifikasi} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
            <Field label="Kode"><input name="kode" required className="input" placeholder="WLD6G" /></Field>
            <Field label="Nama"><input name="nama" required className="input" placeholder="Welder 6G" /></Field>
            <SubmitButton className="btn-primary col-span-2 sm:col-span-1">Tambah</SubmitButton>
          </form>
        </Card>
        <Card title="Set rate baru / adendum">
          <form action={tambahRate} className="grid grid-cols-2 items-end gap-3">
            <Field label="Klasifikasi">
              <select name="classification_id" required className="input">
                {((c.data as any[]) ?? []).map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
              </select>
            </Field>
            <Field label="Rate per jam (Rp)"><input name="rate_per_jam" type="number" min={0} required className="input" /></Field>
            <Field label="Berlaku mulai"><input name="berlaku_mulai" type="date" defaultValue={today} required className="input" /></Field>
            <Field label="Keterangan"><input name="keterangan" className="input" placeholder="Kontrak awal / Adendum 1" /></Field>
            <SubmitButton className="btn-primary col-span-2">Simpan rate</SubmitButton>
          </form>
        </Card>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {((c.data as any[]) ?? []).map((x) => {
          const hist = rates.filter((h) => h.classification_id === x.id);
          const now = rateBerlaku(rates, x.id, today);
          return (
            <Card
              key={x.id}
              title={<span className="flex items-center gap-2">{x.nama} <Badge>{x.kode}</Badge> {!x.aktif && <Badge tone="red">Nonaktif</Badge>}</span>}
              actions={
                <form action={toggleAktif}>
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="aktif" value={String(!x.aktif)} />
                  <SubmitButton className="btn-secondary btn-sm">{x.aktif ? "Nonaktifkan" : "Aktifkan"}</SubmitButton>
                </form>
              }
            >
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-500">Rate berlaku hari ini</div>
                  <div className={`text-lg font-semibold ${now == null ? "text-red-700" : ""}`}>{now == null ? "Belum ada rate" : `${rupiah(now)}/jam`}</div>
                </div>
                <div className="text-right text-xs text-gray-500">{count.get(x.id) ?? 0} karyawan aktif</div>
              </div>
              {hist.length > 0 && (
                <table className="mt-3 w-full text-xs">
                  <tbody>
                    {hist.map((h) => (
                      <tr key={h.id} className="border-t border-gray-100">
                        <td className="py-1">{tanggal(h.berlaku_mulai)}</td>
                        <td className="py-1 text-gray-500">{h.keterangan}</td>
                        <td className="py-1 text-right tabular-nums">{rupiah(h.rate_per_jam)}</td>
                        <td className="py-1 text-right">
                          <form action={hapusRate}><input type="hidden" name="id" value={h.id} /><SubmitButton className="text-red-600 hover:underline" confirm="Hapus rate ini? Invoice yang sudah dibuat tidak berubah.">hapus</SubmitButton></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
