import { LoginForm } from "./login-form";

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 to-brand-500 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" className="mx-auto mb-2 h-14 w-14" />
          <h1 className="text-lg font-bold text-gray-900">Dashboard Manpower Supply</h1>
          <p className="text-xs text-gray-500">Proyek Pabrik Soda Ash Bontang</p>
        </div>
        {sp.pesan && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{sp.pesan}</div>}
        {sp.ok && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.ok}</div>}
        <LoginForm />
      </div>
    </div>
  );
}
