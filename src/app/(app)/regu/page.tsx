import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, DataTable, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Regu & area" };

async function simpanRegu(form: FormData) {
  "use server";
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const id = String(form.get("id") ?? "");
  const row = { nama: String(form.get("nama")).trim(), supervisor_id: String(form.get("supervisor_id") ?? "") || null, area_id: String(form.get("area_id") ?? "") || null };
  const { error } = id ? await supabase.from("teams").update(row).eq("id", id) : await supabase.from("teams").insert(row);
  redirect(`/regu?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Regu disimpan")}`);
}

async function tambahArea(form: FormData) {
  "use server";
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const { error } = await supabase.from("areas").insert({ nama: String(form.get("nama")).trim() });
  redirect(`/regu?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Area ditambahkan")}`);
}

export default async function Regu({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const sp = await searchParams;
  const supabase = await createClient();
  const [t, a, s, e] = await Promise.all([
    supabase.from("teams").select("*").order("nama"),
    supabase.from("areas").select("*").order("nama"),
    supabase.from("profiles").select("id, full_name").eq("role", "supervisor").eq("active", true).order("full_name"),
    supabase.from("employees").select("team_id").in("status", ["aktif", "cuti"]).limit(100000),
  ]);
  const sName = new Map(((s.data as any[]) ?? []).map((x) => [x.id, x.full_name]));
  const aName = new Map(((a.data as any[]) ?? []).map((x) => [x.id, x.nama]));
  const cnt = new Map<string, number>();
  for (const x of (e.data as any[]) ?? []) cnt.set(x.team_id, (cnt.get(x.team_id) ?? 0) + 1);
  const supOpts = ((s.data as any[]) ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>);
  const areaOpts = ((a.data as any[]) ?? []).map((x) => <option key={x.id} value={x.id}>{x.nama}</option>);

  return (
    <>
      <PageHeader title="Regu & area kerja" subtitle="Supervisor hanya dapat melihat & menginput absensi anggota regunya. Anggota regu diatur di data karyawan." />
      <Flash sp={sp} />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Tambah regu" className="lg:col-span-2">
          <form action={simpanRegu} className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
            <Field label="Nama regu"><input name="nama" required className="input" /></Field>
            <Field label="Supervisor"><select name="supervisor_id" className="input"><option value="">-</option>{supOpts}</select></Field>
            <Field label="Area"><select name="area_id" className="input"><option value="">-</option>{areaOpts}</select></Field>
            <SubmitButton>Tambah</SubmitButton>
          </form>
          {!s.data?.length && <p className="mt-2 text-xs text-amber-700">Belum ada user Supervisor. Buat di menu Pengguna (Super Admin).</p>}
        </Card>
        <Card title="Area / disiplin">
          <div className="mb-2 flex flex-wrap gap-1 text-sm">{((a.data as any[]) ?? []).map((x) => <span key={x.id} className="rounded bg-gray-100 px-2 py-0.5">{x.nama}</span>)}</div>
          <form action={tambahArea} className="flex gap-2">
            <input name="nama" required className="input" placeholder="Area baru" />
            <SubmitButton className="btn-secondary">Tambah</SubmitButton>
          </form>
        </Card>
      </div>
      <Card bodyClass="">
        <DataTable
          rows={(t.data as any[]) ?? []}
          rowKey={(r) => r.id}
          empty="Belum ada regu."
          cols={[
            { key: "nama", label: "Regu", primary: true },
            { key: "anggota", label: "Anggota", num: true, render: (r) => cnt.get(r.id) ?? 0 },
            { key: "supervisor", label: "Supervisor", render: (r) => sName.get(r.supervisor_id) ?? "-" },
            { key: "area", label: "Area", render: (r) => aName.get(r.area_id) ?? "-" },
            {
              key: "ubah",
              label: "Ubah",
              render: (r) => (
                <form action={simpanRegu} className="flex flex-wrap gap-1">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="nama" defaultValue={r.nama} className="input w-28 px-2 py-1 text-xs" />
                  <select name="supervisor_id" defaultValue={r.supervisor_id ?? ""} className="input w-36 px-2 py-1 text-xs"><option value="">-</option>{supOpts}</select>
                  <select name="area_id" defaultValue={r.area_id ?? ""} className="input w-28 px-2 py-1 text-xs"><option value="">-</option>{areaOpts}</select>
                  <SubmitButton className="btn-secondary btn-sm">Simpan</SubmitButton>
                </form>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
