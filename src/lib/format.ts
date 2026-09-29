export const TZ = "Asia/Makassar";

const rupiahFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

/** Rp 1.234.567 */
export function rupiah(n: number | string | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-Rp " : "Rp ") + rupiahFmt.format(Math.abs(v));
}

/** Rp 1,2 jt / Rp 3,4 M — untuk kartu KPI & sumbu grafik */
export function rupiahSingkat(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const f = (x: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(x);
  if (a >= 1e9) return `Rp ${f(v / 1e9)} M`;
  if (a >= 1e6) return `Rp ${f(v / 1e6)} jt`;
  if (a >= 1e3) return `Rp ${f(v / 1e3)} rb`;
  return rupiah(v);
}

export function angka(n: number | string | null | undefined): string {
  return numFmt.format(Number(n) || 0);
}

export function persen(n: number | null | undefined): string {
  return `${numFmt.format(Number(n) || 0)}%`;
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" */
export function tanggal(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function tanggalWaktu(ts: string | null | undefined): string {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts)) + " WITA";
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function namaBulan(iso: string, panjang = false): string {
  const [y, m] = iso.split("-").map(Number);
  return `${(panjang ? BULAN_PANJANG : BULAN)[m - 1]} ${y}`;
}

/** Tanggal hari ini di zona WITA, "YYYY-MM-DD". */
export function hariIni(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function tambahHari(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function awalBulan(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function akhirBulan(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function tambahBulan(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}

export function selisihHari(dari: string, sampai: string): number {
  return Math.round((Date.parse(sampai + "T00:00:00Z") - Date.parse(dari + "T00:00:00Z")) / 86_400_000);
}

/** Masa kerja "x th y bln" */
export function masaKerja(masuk: string, sampai?: string | null): string {
  const akhir = sampai || hariIni();
  const [y1, m1, d1] = masuk.split("-").map(Number);
  const [y2, m2, d2] = akhir.split("-").map(Number);
  let bulan = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (bulan < 0) bulan = 0;
  const th = Math.floor(bulan / 12);
  const bl = bulan % 12;
  if (!th) return `${bl} bln`;
  return `${th} th ${bl} bln`;
}

export function jam(n: number | string | null | undefined): string {
  return `${angka(n)} j`;
}
