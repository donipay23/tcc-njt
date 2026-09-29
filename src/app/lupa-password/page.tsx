import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Lupa password" };

async function kirim(form: FormData) {
  "use server";
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const supabase = await createClient();
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback?next=/ganti-password` });
  }
  // Pesan selalu sama agar tidak membocorkan email mana yang terdaftar
  redirect("/lupa-password?terkirim=1");
}

export default async function LupaPassword({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-1 text-lg font-bold">Lupa password</h1>
        <p className="mb-4 text-sm text-gray-500">
          Masukkan email terdaftar untuk menerima link reset. Karyawan yang tidak memiliki email dapat meminta
          <b> reset password ke Admin</b>.
        </p>
        {sp.terkirim ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Jika email terdaftar, link reset sudah dikirim. Periksa kotak masuk Anda.</p>
        ) : (
          <form action={kirim} className="space-y-3">
            <input name="email" type="email" required className="input" placeholder="nama@email.com" />
            <button className="btn-primary w-full">Kirim link reset</button>
          </form>
        )}
        <Link href="/login" className="mt-4 block text-center text-xs text-brand-600 hover:underline">
          Kembali ke login
        </Link>
      </div>
    </div>
  );
}
