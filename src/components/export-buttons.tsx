"use client";
import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { exportExcel, exportPdf, type ExportCol, type Sheet } from "@/lib/export";

export function ExportButtons({ filename, judul, subjudul = "", cols, rows, extraSheets = [], pdf = true }: {
  filename: string;
  judul: string;
  subjudul?: string;
  cols: ExportCol[];
  rows: Record<string, any>[];
  extraSheets?: Sheet[];
  pdf?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={busy || !rows.length}
        className="btn-secondary"
        onClick={() => run(() => exportExcel(filename, [{ name: "Data", cols, rows }, ...extraSheets], `${judul} ${subjudul}`.trim()))}
      >
        <FileSpreadsheet size={16} /> Excel
      </button>
      {pdf && (
        <button type="button" disabled={busy || !rows.length} className="btn-secondary" onClick={() => run(() => exportPdf(filename, judul, subjudul, cols, rows))}>
          <FileText size={16} /> PDF
        </button>
      )}
    </>
  );
}
