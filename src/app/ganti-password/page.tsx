import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ganti password" };
export const dynamic = "force-dynamic";

async function simpan(form: FormData) {
  "use server";
  const pw = String(form.get("password") ?? "");
  const pw2 = String(form.get("password2") ?? "");
  if (pw.length < 8) redirect("/ganti-password?err=Password+minimal+8+karakter");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) redirect("/ganti-password?err=Password+harus+berisi+huruf+dan+angka");
  if (pw !== pw2) redirect("/ganti-password?err=Konfirmasi+password+tidak+sama");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) redirect(`/ganti-password?err=${encodeURIComponent(error.message)}`);
  await supabase.rpc("tandai_password_diganti");
  redirect("/dashboard?ok=Password+berhasil+diganti");
}

export default async function GantiPassword({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-1 text-lg font-bold">Ganti password</h1>
        <p className="mb-4 text-sm text-gray-500">Demi keamanan, buat password baru (min. 8 karakter, berisi huruf & angka).</p>
        {sp.err && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{sp.err}</p>}
        <form action={simpan} className="space-y-3">
          <input name="password" type="password" required minLength={8} className="input" placeholder="Password baru" autoComplete="new-password" />
          <input name="password2" type="password" required minLength={8} className="input" placeholder="Ulangi password baru" autoComplete="new-password" />
          <button className="btn-primary w-full">Simpan password</button>
        </form>
      </div>
    </div>
  );
}
