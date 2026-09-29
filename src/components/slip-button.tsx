"use client";
import { Download } from "lucide-react";
import { slipGajiPdf, type SlipData } from "@/lib/export";

export interface PayrollRow {
  gaji_pokok: number;
  tunjangan_tetap: number;
  tunjangan_tidak_tetap: number;
  upah_lembur: number;
  bpjs_karyawan: { kes?: number; jht?: number; jp?: number };
  pph21: number;
  potongan_lain: number;
  potongan_keterangan?: string | null;
  take_home_pay: number;
  hari_hadir: number;
  jam_normal: number;
  jam_lembur: number;
  jam_konversi: number;
  upah_per_jam: number;
  detail?: { pph21_mode?: string };
}

export function toSlip(p: PayrollRow, meta: { perusahaan: string; periode: string; nama: string; nik: string; klasifikasi: string; rekening: string }): SlipData {
  const n = (v: any) => Number(v) || 0;
  const potongan: [string, number][] = [
    ["BPJS Kesehatan (1%)", n(p.bpjs_karyawan?.kes)],
    ["BPJS JHT (2%)", n(p.bpjs_karyawan?.jht)],
    ["BPJS JP (1%)", n(p.bpjs_karyawan?.jp)],
  ];
  if (p.detail?.pph21_mode === "dipotong_karyawan" && n(p.pph21)) potongan.push(["PPh 21", n(p.pph21)]);
  if (n(p.potongan_lain)) potongan.push([p.potongan_keterangan || "Potongan lain (kasbon, dll.)", n(p.potongan_lain)]);
  return {
    ...meta,
    hari_hadir: p.hari_hadir,
    jam_normal: n(p.jam_normal),
    jam_lembur: n(p.jam_lembur),
    jam_konversi: n(p.jam_konversi),
    upah_per_jam: n(p.upah_per_jam),
    pendapatan: [
      ["Gaji pokok", n(p.gaji_pokok)],
      ["Tunjangan tetap", n(p.tunjangan_tetap)],
      ["Tunjangan tidak tetap", n(p.tunjangan_tidak_tetap)],
      [`Upah lembur (${n(p.jam_konversi)} jam konversi)`, n(p.upah_lembur)],
    ],
    potongan,
    take_home_pay: n(p.take_home_pay),
  };
}

export function SlipButton({ payroll, meta, label = "Slip PDF" }: { payroll: PayrollRow; meta: Parameters<typeof toSlip>[1]; label?: string }) {
  return (
    <button type="button" className="btn-secondary btn-sm" onClick={() => slipGajiPdf(toSlip(payroll, meta))}>
      <Download size={14} /> {label}
    </button>
  );
}
