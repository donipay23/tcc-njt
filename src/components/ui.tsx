import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClass = "p-4" }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          {actions && <div className="flex gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone = "default", href }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
  href?: string;
}) {
  const toneCls = { default: "text-gray-900", good: "text-emerald-700", bad: "text-red-700", warn: "text-amber-700" }[tone];
  const body = (
    <div className="card h-full p-3 sm:p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

const BADGE_TONE: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-brand-100 text-brand-700",
  purple: "bg-purple-100 text-purple-800",
};

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof BADGE_TONE }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONE[tone]}`}>{children}</span>;
}

export function toneStatus(status: string): keyof typeof BADGE_TONE {
  if (["aktif", "approved", "lunas", "dibayar", "hadir", "locked"].includes(status)) return "green";
  if (["submitted", "draft", "cuti", "dibayar_sebagian", "rencana", "izin", "open"].includes(status)) return "amber";
  if (["rejected", "resign", "non_aktif", "alpa"].includes(status)) return "red";
  if (["terkirim", "disetujui", "sakit"].includes(status)) return "blue";
  return "gray";
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  if (!ok && !err) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${err ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {err ?? ok}
    </div>
  );
}

export function Empty({ children = "Belum ada data." }: { children?: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-gray-500">{children}</div>;
}

/**
 * Tabel responsif: tabel biasa di layar ≥ md, kartu bertumpuk di HP.
 * `cols[].mobile === false` menyembunyikan kolom di tampilan kartu.
 */
export interface Col<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  num?: boolean;
  mobile?: boolean;
  primary?: boolean;
}

export function DataTable<T extends Record<string, any>>({ cols, rows, rowKey, footer, empty }: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  footer?: ReactNode;
  empty?: ReactNode;
}) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const cell = (c: Col<T>, r: T) => (c.render ? c.render(r) : (r[c.key] ?? "-"));
  const primary = cols.find((c) => c.primary) ?? cols[0];
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`th ${c.num ? "num" : ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-gray-50">
                {cols.map((c) => (
                  <td key={c.key} className={`td ${c.num ? "num" : ""}`}>{cell(c, r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
      <ul className="divide-y divide-gray-100 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-4 py-3">
            <div className="mb-1 font-medium text-gray-900">{cell(primary, r)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {cols
                .filter((c) => c !== primary && c.mobile !== false)
                .map((c) => (
                  <div key={c.key} className="flex flex-col">
                    <dt className="text-gray-500">{c.label}</dt>
                    <dd className="text-gray-900">{cell(c, r)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value || "-"}</dd>
    </div>
  );
}

/** Form filter GET sederhana (periode + field tambahan) */
export function RangeFilter({ mulai, selesai, children }: { mulai: string; selesai: string; children?: ReactNode }) {
  return (
    <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
      <Field label="Dari">
        <input type="date" name="mulai" defaultValue={mulai} className="input" />
      </Field>
      <Field label="Sampai">
        <input type="date" name="selesai" defaultValue={selesai} className="input" />
      </Field>
      {children}
      <button className="btn-primary">Terapkan</button>
    </form>
  );
}
