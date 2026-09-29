"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { angka, rupiah, rupiahSingkat } from "@/lib/format";

export const PALETTE = ["#1d74c9", "#e8833a", "#2ca58d", "#c2410c", "#7c3aed", "#0891b2", "#be185d", "#65a30d", "#a16207", "#475569"];

type Fmt = "rupiah" | "angka";
const fmtFn = (f: Fmt) => (f === "rupiah" ? rupiah : angka);
const axisFn = (f: Fmt) => (f === "rupiah" ? rupiahSingkat : angka);

export interface Series {
  key: string;
  label: string;
  color?: string;
  stack?: string;
}

export function BarChartCard({ data, x, series, format = "angka", height = 260, horizontal = false }: {
  data: Record<string, any>[];
  x: string;
  series: Series[];
  format?: Fmt;
  height?: number;
  horizontal?: boolean;
}) {
  if (!data.length) return <div className="py-10 text-center text-sm text-gray-500">Belum ada data.</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 20 : 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={axisFn(format)} fontSize={11} />
            <YAxis type="category" dataKey={x} width={110} fontSize={11} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} fontSize={11} />
            <YAxis tickFormatter={axisFn(format)} fontSize={11} width={format === "rupiah" ? 70 : 40} />
          </>
        )}
        <Tooltip formatter={(v) => fmtFn(format)(Number(v))} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i]} stackId={s.stack} radius={s.stack ? 0 : [3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartCard({ data, x, series, format = "angka", height = 260 }: {
  data: Record<string, any>[];
  x: string;
  series: Series[];
  format?: Fmt;
  height?: number;
}) {
  if (!data.length) return <div className="py-10 text-center text-sm text-gray-500">Belum ada data.</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={x} fontSize={11} />
        <YAxis tickFormatter={axisFn(format)} fontSize={11} width={format === "rupiah" ? 70 : 40} />
        <Tooltip formatter={(v) => fmtFn(format)(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? PALETTE[i]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChartCard({ data, format = "rupiah", height = 260 }: {
  data: { nama: string; nilai: number }[];
  format?: Fmt;
  height?: number;
}) {
  const rows = data.filter((d) => d.nilai > 0);
  if (!rows.length) return <div className="py-10 text-center text-sm text-gray-500">Belum ada data.</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="nilai" nameKey="nama" innerRadius="55%" outerRadius="85%" paddingAngle={1}>
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => fmtFn(format)(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
