import { requireRole } from "@/lib/auth";
import { Flash, PageHeader } from "@/components/ui";
import { EmployeeForm } from "../employee-form";

export const metadata = { title: "Tambah karyawan" };

export default async function Baru({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin", "admin");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Tambah karyawan" subtitle="NIK internal dibuat otomatis" />
      <Flash sp={sp} />
      <EmployeeForm />
    </>
  );
}
