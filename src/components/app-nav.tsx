"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays, CheckCheck, ClipboardCheck, Clock, FileText, History, Landmark, LayoutDashboard, Menu, Receipt,
  Settings, ShieldCheck, ShoppingCart, Tags, TrendingUp, UserRound, Users, UsersRound, Wallet, X, type LucideIcon,
} from "lucide-react";
import type { NavItem } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  CalendarDays, CheckCheck, ClipboardCheck, Clock, FileText, History, Landmark, LayoutDashboard, Receipt,
  Settings, ShieldCheck, ShoppingCart, Tags, TrendingUp, UserRound, Users, UsersRound, Wallet,
};

function isActive(path: string, href: string, all: NavItem[]) {
  if (path === href) return true;
  if (!path.startsWith(href + "/")) return false;
  // pilih item paling spesifik
  return !all.some((i) => i.href !== href && i.href.startsWith(href) && (path === i.href || path.startsWith(i.href + "/")));
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  let lastGroup: string | undefined;
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((it) => {
        const Icon = ICONS[it.icon] ?? LayoutDashboard;
        const header = it.group !== lastGroup && it.group ? it.group : null;
        lastGroup = it.group;
        const active = isActive(path, it.href, items);
        return (
          <div key={it.href}>
            {header && <div className="mt-3 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{header}</div>}
            <Link
              href={it.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-brand-50 font-semibold text-brand-700" : "text-gray-700 hover:bg-gray-100"}`}
            >
              <Icon size={18} /> {it.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const main = items.slice(0, items.length > 5 ? 4 : 5);
  const rest = items.length > 5 ? items.slice(4) : [];
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-16 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-2 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-1">
              {rest.map((it) => {
                const Icon = ICONS[it.icon] ?? LayoutDashboard;
                return (
                  <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className="flex flex-col items-center gap-1 rounded-lg p-3 text-center text-xs text-gray-700 hover:bg-gray-100">
                    <Icon size={22} /> {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid h-16 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${main.length + (rest.length ? 1 : 0)}, 1fr)` }}>
        {main.map((it) => {
          const Icon = ICONS[it.icon] ?? LayoutDashboard;
          const active = isActive(path, it.href, items);
          return (
            <Link key={it.href} href={it.href} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-brand-600 font-semibold" : "text-gray-500"}`}>
              <Icon size={22} />
              <span className="truncate px-1">{it.label}</span>
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] text-gray-500">
            {open ? <X size={22} /> : <Menu size={22} />}
            Lainnya
          </button>
        )}
      </nav>
    </>
  );
}
