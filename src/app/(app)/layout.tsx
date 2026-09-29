import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getPerusahaan, getSession } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/types";
import { BottomNav, Sidebar } from "@/components/app-nav";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (s.profile.must_change_password) redirect("/ganti-password");
  const p = await getPerusahaan();
  const items = navFor(s.role, { canFinance: s.canFinance, employeeId: s.profile.employee_id });
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="border-b border-gray-100 px-4 py-4">
            <div className="text-sm font-bold text-brand-700">Manpower Supply</div>
            <div className="text-xs text-gray-500">Soda Ash Bontang · {p.klien}</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Sidebar items={items} />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{p.nama}</div>
            <div className="truncate text-xs text-gray-500 lg:hidden">Soda Ash Bontang</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="max-w-36 truncate text-sm font-medium">{s.profile.full_name}</div>
              <div className="text-xs text-gray-500">{ROLE_LABEL[s.role]}</div>
            </div>
            <form action={logout}>
              <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Keluar" aria-label="Keluar">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-3 py-4 pb-24 sm:px-6 lg:pb-8">{children}</main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
