"use client";
import { useActionState } from "react";
import { Download } from "lucide-react";
import { IMPORT_COLUMNS } from "@/lib/import-template";
import { exportExcel } from "@/lib/export";
import { importKaryawan, type ImportResult } from "./actions";

async function downloadTemplate() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Karyawan");
  ws.addRow(IMPORT_COLUMNS.map((c) => c.label)).font = { bold: true };
  ws.addRow(IMPORT_COLUMNS.map((c) => c.contoh));
  IMPORT_COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(14, c.label.length + 2);
    ws.getColumn(i + 1).numFmt = "@"; // teks, agar NIK/No. HP tidak berubah jadi angka
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf]));
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-import-karyawan.xlsx";
  a.click();
}

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(importKaryawan, null);
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>Unduh template, isi mulai baris ke-2 (hapus baris contoh).</li>
          <li>Kode klasifikasi, area, dan nama regu harus sudah ada di master data.</li>
          <li>Unggah file. Baris yang gagal dilaporkan dan tidak disimpan; baris lain tetap tersimpan.</li>
        </ol>
        <button type="button" onClick={downloadTemplate} className="btn-secondary">
          <Download size={16} /> Unduh template Excel
        </button>
        <form action={action} className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center">
          <input type="file" name="file" accept=".xlsx" required className="input sm:max-w-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="buat_akun" defaultChecked className="h-4 w-4" /> Buatkan akun login
          </label>
          <button className="btn-primary" disabled={pending}>{pending ? "Mengimpor…" : "Import"}</button>
        </form>
      </div>
      {state?.error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}
      {state && !state.error && (
        <div className="card p-4">
          <p className="text-sm">
            <b className="text-emerald-700">{state.ok} baris berhasil</b> · <b className="text-red-700">{state.gagal.length} baris gagal</b>
          </p>
          {state.gagal.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead><tr><th className="th">Baris</th><th className="th">Nama</th><th className="th">Alasan</th></tr></thead>
              <tbody>
                {state.gagal.map((g, i) => (
                  <tr key={i}><td className="td">{g.baris}</td><td className="td">{g.nama}</td><td className="td whitespace-normal text-red-700">{g.alasan}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {state.akun.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Akun login dibuat — unduh sekarang, password hanya tampil sekali.</p>
              <button
                type="button"
                className="btn-secondary btn-sm mt-2"
                onClick={() =>
                  exportExcel("akun-karyawan-baru", [{
                    name: "Akun",
                    cols: [{ key: "nik", label: "NIK" }, { key: "nama", label: "Nama" }, { key: "login", label: "Email login" }, { key: "password", label: "Password awal" }],
                    rows: state.akun,
                  }])
                }
              >
                <Download size={14} /> Unduh daftar akun (.xlsx)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
