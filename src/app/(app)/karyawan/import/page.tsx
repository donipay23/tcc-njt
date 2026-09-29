import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import karyawan" };
export const maxDuration = 300; // import ratusan baris + pembuatan akun

export default async function ImportPage() {
  await requireRole("super_admin", "admin");
  return (
    <>
      <PageHeader title="Import karyawan dari Excel" subtitle="Template disediakan, dengan validasi & laporan baris yang gagal" />
      <ImportForm />
    </>
  );
}
