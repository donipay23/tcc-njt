export type Role = "super_admin" | "admin" | "supervisor" | "karyawan";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  phone: string | null;
  employee_id: string | null;
  must_change_password: boolean;
  active: boolean;
}

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  karyawan: "Karyawan",
};

export const STATUS_KARYAWAN: Record<string, string> = {
  aktif: "Aktif",
  cuti: "Cuti",
  non_aktif: "Non-aktif",
  resign: "Resign",
  selesai_kontrak: "Selesai kontrak",
};

export const STATUS_KEHADIRAN: Record<string, string> = {
  hadir: "Hadir",
  sakit: "Sakit",
  izin: "Izin",
  alpa: "Alpa",
  cuti: "Cuti",
  libur: "Libur",
};

export const STATUS_APPROVAL: Record<string, string> = {
  draft: "Draft",
  submitted: "Menunggu approval",
  approved: "Approved",
  rejected: "Ditolak",
};

export const STATUS_INVOICE: Record<string, string> = {
  draft: "Draft",
  terkirim: "Terkirim",
  disetujui: "Disetujui klien",
  dibayar_sebagian: "Dibayar sebagian",
  lunas: "Lunas",
};

export const KATEGORI_KAS: Record<string, string> = {
  pembayaran_invoice: "Pembayaran invoice",
  modal: "Modal masuk",
  pinjaman: "Pinjaman masuk",
  payroll: "Payroll (transfer gaji)",
  bpjs: "BPJS",
  pajak: "Pajak",
  biaya_non_gaji: "Biaya non-gaji",
  pengembalian_modal: "Pengembalian modal",
  pengembalian_pinjaman: "Pengembalian pinjaman",
  lainnya: "Lainnya",
};
