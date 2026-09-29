import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader } from "@/components/ui";
import { EmployeeForm } from "../../employee-form";

export const metadata = { title: "Edit karyawan" };

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [e, c, a] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).maybeSingle(),
    supabase.from("employee_compensation").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("employee_allowances").select("nama, jenis, basis, jumlah").eq("employee_id", id).order("created_at"),
  ]);
  if (!e.data) notFound();
  return (
    <>
      <PageHeader title={`Edit: ${e.data.nama}`} subtitle={e.data.nik} />
      <Flash sp={sp} />
      <EmployeeForm emp={e.data} comp={c.data} allowances={(a.data ?? []).map((x: any) => ({ ...x, jumlah: Number(x.jumlah) }))} />
    </>
  );
}
