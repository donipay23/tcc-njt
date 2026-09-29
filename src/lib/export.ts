"use client";
import { angka, rupiah, tanggal } from "./format";

export interface ExportCol {
  key: string;
  label: string;
  type?: "text" | "rupiah" | "angka" | "tanggal";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface Sheet {
  name: string;
  cols: ExportCol[];
  rows: Record<string, any>[];
}

/** Export ke .xlsx (angka tetap numerik agar bisa diolah di Excel). */
export async function exportExcel(filename: string, sheets: Sheet[], judul?: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31));
    let start = 1;
    if (judul) {
      ws.addRow([judul]).font = { bold: true, size: 13 };
      ws.addRow([]);
      start = 3;
    }
    const header = ws.addRow(sh.cols.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEEFE" } };
    });
    for (const r of sh.rows) {
      ws.addRow(
        sh.cols.map((c) => {
          const v = r[c.key];
          if (c.type === "rupiah" || c.type === "angka") return v == null || v === "" ? null : Number(v);
          if (c.type === "tanggal") return v ? tanggal(String(v)) : "";
          return v ?? "";
        }),
      );
    }
    sh.cols.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(10, Math.min(40, c.label.length + 4));
      if (c.type === "rupiah") col.numFmt = '"Rp" #,##0';
      if (c.type === "angka") col.numFmt = "#,##0.##";
    });
    ws.views = [{ state: "frozen", ySplit: start }];
  }
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function fmtCell(c: ExportCol, v: any) {
  if (c.type === "rupiah") return rupiah(v);
  if (c.type === "angka") return angka(v);
  if (c.type === "tanggal") return tanggal(v);
  return v == null ? "" : String(v);
}

/** Export tabel ke PDF (landscape bila kolom banyak). */
export async function exportPdf(filename: string, judul: string, subjudul: string, cols: ExportCol[], rows: Record<string, any>[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: cols.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(13);
  doc.text(judul, 14, 14);
  doc.setFontSize(9);
  doc.text(subjudul, 14, 20);
  autoTable(doc, {
    startY: 24,
    head: [cols.map((c) => c.label)],
    body: rows.map((r) => cols.map((c) => fmtCell(c, r[c.key]))),
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [21, 94, 168] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: c.type === "rupiah" || c.type === "angka" ? "right" : "left" }])),
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export interface SlipData {
  perusahaan: string;
  periode: string;
  nama: string;
  nik: string;
  klasifikasi: string;
  rekening: string;
  hari_hadir: number;
  jam_normal: number;
  jam_lembur: number;
  jam_konversi: number;
  upah_per_jam: number;
  pendapatan: [string, number][];
  potongan: [string, number][];
  take_home_pay: number;
}

/** Slip gaji PDF (A5 portrait). */
export async function slipGajiPdf(d: SlipData) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  doc.setFontSize(12);
  doc.text(d.perusahaan, 10, 12);
  doc.setFontSize(10);
  doc.text(`SLIP GAJI — ${d.periode}`, 10, 18);
  doc.setFontSize(8.5);
  const info = [
    ["Nama", d.nama, "NIK", d.nik],
    ["Klasifikasi", d.klasifikasi, "Rekening", d.rekening],
    ["Hari hadir", String(d.hari_hadir), "Jam normal", angka(d.jam_normal)],
    ["Jam lembur", angka(d.jam_lembur), "Jam konversi", angka(d.jam_konversi)],
    ["Upah/jam lembur", rupiah(d.upah_per_jam), "", ""],
  ];
  autoTable(doc, { startY: 22, body: info, theme: "plain", styles: { fontSize: 8, cellPadding: 0.8 } });
  const y = (doc as any).lastAutoTable.finalY + 3;
  autoTable(doc, {
    startY: y,
    head: [["Pendapatan", "Jumlah"]],
    body: [...d.pendapatan.map(([k, v]) => [k, rupiah(v)]), ["Total pendapatan", rupiah(d.pendapatan.reduce((a, [, v]) => a + v, 0))]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [21, 94, 168] },
    columnStyles: { 1: { halign: "right" } },
  });
  const y2 = (doc as any).lastAutoTable.finalY + 3;
  autoTable(doc, {
    startY: y2,
    head: [["Potongan", "Jumlah"]],
    body: [...d.potongan.map(([k, v]) => [k, rupiah(v)]), ["Total potongan", rupiah(d.potongan.reduce((a, [, v]) => a + v, 0))]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [190, 70, 50] },
    columnStyles: { 1: { halign: "right" } },
  });
  const y3 = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(11);
  doc.text(`Take home pay: ${rupiah(d.take_home_pay)}`, 10, y3);
  doc.setFontSize(7);
  doc.text("Dokumen ini dibuat otomatis oleh sistem dan sah tanpa tanda tangan.", 10, y3 + 6);
  doc.save(`Slip-${d.nik}-${d.periode.replace(/[^\w]+/g, "-")}.pdf`);
}
