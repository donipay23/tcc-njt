import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAccount, resetPassword } from "@/lib/accounts";
import { setSecretFlash } from "@/lib/flash-cookie";
import { normalizePhone } from "@/lib/phone";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { Badge, Card, DataTable, Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { FlashSecret } from "../karyawan/flash-secret";

export const metadata = { title: "Pengguna" };
const ROLES: Role[] = ["super_admin", "admin", "supervisor", "karyawan"];

async function buatUser(form: FormData) {
  "use server";
  await requireRole("super_admin");
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role)) redirect("/pengguna?err=Role+tidak+valid");
  try {
    const acc = await createAccount({
      full_name: String(form.get("full_name")),
      role,
      email: String(form.get("email")),
      phone: String(form.get("phone") ?? ""),
      employee_id: String(form.get("employee_id") ?? "") || null,
    });
    await setSecretFlash(`User dibuat. Login: ${acc.email} — Password awal: ${acc.password}`);
  } catch (e) {
    redirect(`/pengguna?err=${encodeURIComponent((e as Error).message)}`);
  }
  redirect("/pengguna?ok=User+dibuat");
}

async function ubahUser(form: FormData) {
  "use server";
  const s = await requireRole("super_admin");
  const id = String(form.get("id"));
  const role = String(form.get("role")) as Role;
  const active = form.get("active") === "on";
  if (id === s.userId && (role !== "super_admin" || !active)) redirect("/pengguna?err=Tidak+dapat+menurunkan+atau+menonaktifkan+akun+sendiri");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role, active, phone: normalizePhone(String(form.get("phone") ?? "")), employee_id: String(form.get("employee_id") ?? "") || null })
    .eq("id", id);
  if (!error && !active) await createAdminClient().auth.admin.signOut(id).catch(() => {});
  redirect(`/pengguna?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Pengguna diperbarui")}`);
}

async function reset(form: FormData) {
  "use server";
  await requireRole("super_admin");
  const pw = await resetPassword(String(form.get("id")));
  await setSecretFlash(`Password sementara untuk ${form.get("email")}: ${pw}`);
  redirect("/pengguna");
}

export default async function Pengguna({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin");
  const sp = await searchParams;
  const supabase = await createClient();
  const [p, e] = await Promise.all([
    supabase.from("profiles").select("*").neq("role", "karyawan").order("role").order("full_name"),
    supabase.from("employees").select("id, nik, nama").eq("status", "aktif").order("nama").limit(5000),
  ]);
  const { count: jumlahKaryawan } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "karyawan");
  const empOpts = ((e.data as any[]) ?? []).map((x) => <option key={x.id} value={x.id}>{x.nama} ({x.nik})</option>);

  return (
    <>
      <PageHeader title="Pengguna & role" subtitle={`Akun Super Admin, Admin, Supervisor. ${jumlahKaryawan ?? 0} akun karyawan dikelola dari halaman profil karyawan.`} />
      <Flash sp={sp} />
      <FlashSecret />
      <Card title="Buat pengguna" className="mb-4">
        <form action={buatUser} className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
          <Field label="Nama lengkap"><input name="full_name" required className="input" /></Field>
          <Field label="Email"><input name="email" type="email" required className="input" /></Field>
          <Field label="No. HP"><input name="phone" className="input" /></Field>
          <Field label="Role">
            <select name="role" defaultValue="supervisor" className="input">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
          </Field>
          <Field label="Tautkan ke data karyawan (ops.)"><select name="employee_id" className="input"><option value="">-</option>{empOpts}</select></Field>
          <SubmitButton>Buat</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-gray-500">Password awal dibuat otomatis, ditampilkan sekali, dan wajib diganti saat login pertama. Supervisor yang juga karyawan dapat ditautkan agar bisa melihat slip gajinya sendiri.</p>
      </Card>
      <Card bodyClass="">
        <DataTable
          rows={(p.data as any[]) ?? []}
          rowKey={(r) => r.id}
          cols={[
            { key: "full_name", label: "Nama", primary: true, render: (r) => <>{r.full_name}<div className="text-xs text-gray-500">{r.email}</div></> },
            { key: "role", label: "Role", render: (r) => <Badge tone={r.role === "super_admin" ? "purple" : r.role === "admin" ? "blue" : "gray"}>{ROLE_LABEL[r.role as Role]}</Badge> },
            { key: "status", label: "Status", render: (r) => <>{r.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>} {r.must_change_password && <Badge tone="amber">Password awal</Badge>}</> },
            {
              key: "ubah",
              label: "Ubah",
              render: (r) => (
                <form action={ubahUser} className="flex flex-wrap items-center gap-1">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="role" defaultValue={r.role} className="input w-32 px-2 py-1 text-xs">{ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select>
                  <input name="phone" defaultValue={r.phone ?? ""} placeholder="No. HP" className="input w-28 px-2 py-1 text-xs" />
                  <select name="employee_id" defaultValue={r.employee_id ?? ""} className="input w-40 px-2 py-1 text-xs"><option value="">(tanpa karyawan)</option>{empOpts}</select>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={r.active} /> aktif</label>
                  <SubmitButton className="btn-secondary btn-sm">Simpan</SubmitButton>
                </form>
              ),
            },
            {
              key: "reset",
              label: "",
              render: (r) => (
                <form action={reset}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="email" value={r.email} />
                  <SubmitButton className="btn-secondary btn-sm" confirm={`Reset password ${r.full_name}?`}>Reset password</SubmitButton>
                </form>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
