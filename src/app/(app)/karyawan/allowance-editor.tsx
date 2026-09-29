"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export interface AllowanceRow {
  nama: string;
  jenis: "tetap" | "tidak_tetap";
  basis: "bulanan" | "harian";
  jumlah: number;
}

export function AllowanceEditor({ initial }: { initial: AllowanceRow[] }) {
  const [rows, setRows] = useState<AllowanceRow[]>(initial);
  const update = (i: number, patch: Partial<AllowanceRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-2 sm:grid-cols-[2fr_1.3fr_1.2fr_1.5fr_auto]">
          <input name="tunj_nama" value={r.nama} onChange={(e) => update(i, { nama: e.target.value })} className="input col-span-2 sm:col-span-1" placeholder="Nama tunjangan (mis. Jabatan, Makan)" />
          <select name="tunj_jenis" value={r.jenis} onChange={(e) => update(i, { jenis: e.target.value as AllowanceRow["jenis"] })} className="input">
            <option value="tetap">Tetap</option>
            <option value="tidak_tetap">Tidak tetap</option>
          </select>
          <select name="tunj_basis" value={r.basis} onChange={(e) => update(i, { basis: e.target.value as AllowanceRow["basis"] })} className="input">
            <option value="bulanan">per bulan</option>
            <option value="harian">per hari hadir</option>
          </select>
          <input name="tunj_jumlah" type="number" min={0} step={1000} value={r.jumlah || ""} onChange={(e) => update(i, { jumlah: Number(e.target.value) })} className="input" placeholder="Rp" />
          <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="btn-secondary" aria-label="Hapus">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((r) => [...r, { nama: "", jenis: "tetap", basis: "bulanan", jumlah: 0 }])} className="btn-secondary btn-sm">
        <Plus size={14} /> Tambah tunjangan
      </button>
      <p className="text-xs text-gray-500">
        Tunjangan <b>tetap</b> masuk dasar upah lembur & BPJS. Tunjangan <b>tidak tetap</b> (makan, transport berdasarkan kehadiran) memengaruhi aturan 75%.
      </p>
    </div>
  );
}
