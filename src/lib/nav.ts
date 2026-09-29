import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // nama ikon lucide
  group?: string;
}

export function navFor(role: Role, opts: { canFinance: boolean; employeeId: string | null }): NavItem[] {
  if (role === "karyawan") {
    const items: NavItem[] = [{ href: "/dashboard", label: "Beranda", icon: "LayoutDashboard" }];
    if (opts.employeeId) {
      items.push({ href: `/absensi/kalender/${opts.employeeId}`, label: "Absensi", icon: "CalendarDays" });
      items.push({ href: "/slip", label: "Slip Gaji", icon: "Receipt" });
      items.push({ href: `/karyawan/${opts.employeeId}`, label: "Profil", icon: "UserRound" });
    }
    return items;
  }
  if (role === "supervisor") {
    const items: NavItem[] = [
      { href: "/dashboard", label: "Beranda", icon: "LayoutDashboard" },
      { href: "/absensi/input", label: "Input Absensi", icon: "ClipboardCheck" },
      { href: "/absensi", label: "Rekap Jam", icon: "Clock" },
      { href: "/karyawan", label: "Tim Saya", icon: "Users" },
    ];
    if (opts.employeeId) items.push({ href: "/slip", label: "Slip Gaji", icon: "Receipt" });
    return items;
  }
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/karyawan", label: "Karyawan", icon: "Users" },
    { href: "/absensi/input", label: "Input Absensi", icon: "ClipboardCheck", group: "Absensi & Lembur" },
    { href: "/absensi/approval", label: "Approval", icon: "CheckCheck", group: "Absensi & Lembur" },
    { href: "/absensi", label: "Rekap Lembur", icon: "Clock", group: "Absensi & Lembur" },
    { href: "/payroll", label: "Payroll", icon: "Wallet", group: "Keuangan" },
    { href: "/biaya", label: "Cost Operasional", icon: "ShoppingCart", group: "Keuangan" },
  ];
  if (opts.canFinance) {
    items.push(
      { href: "/invoice", label: "Invoice", icon: "FileText", group: "Keuangan" },
      { href: "/profit", label: "Profit", icon: "TrendingUp", group: "Keuangan" },
      { href: "/kas", label: "Arus Kas", icon: "Landmark", group: "Keuangan" },
    );
  }
  items.push(
    { href: "/klasifikasi", label: "Klasifikasi & Rate", icon: "Tags", group: "Master" },
    { href: "/regu", label: "Regu & Area", icon: "UsersRound", group: "Master" },
  );
  if (role === "super_admin") {
    items.push(
      { href: "/pengaturan", label: "Pengaturan", icon: "Settings", group: "Sistem" },
      { href: "/pengguna", label: "Pengguna", icon: "ShieldCheck", group: "Sistem" },
    );
  }
  items.push({ href: "/audit", label: "Audit Log", icon: "History", group: "Sistem" });
  return items;
}
