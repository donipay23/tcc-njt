import { describe, expect, it } from "vitest";
import { hitungPph21, hitungPph21GrossUp, kategoriTER, pajakPasal17, parsePtkp, tarifTER } from "./pph21";
import { hitungPayroll } from "./payroll";
import { DEFAULT_PPH21, DEFAULT_SETTINGS, mergeSettings } from "./settings";

const s = DEFAULT_PPH21;

describe("Status PTKP & kategori TER", () => {
  it.each([
    ["TK/0", "A"], ["TK/1", "A"], ["K/0", "A"], ["TK/2", "B"], ["TK/3", "B"], ["K/1", "B"], ["K/2", "B"], ["K/3", "C"],
    ["", "A"], ["k-2", "B"], ["K/5", "C"],
  ])("%s → kategori %s", (ptkp, kat) => {
    expect(kategoriTER(parsePtkp(ptkp))).toBe(kat);
  });
});

describe("TER bulanan", () => {
  it("batas lapisan inklusif", () => {
    expect(tarifTER(5_400_000, "A", s)).toBe(0);
    expect(tarifTER(5_400_001, "A", s)).toBe(0.0025);
    expect(tarifTER(1_500_000_000, "A", s)).toBe(0.34);
  });
  it("TK/0 bruto 10 jt → 2% = Rp 200.000", () => {
    expect(hitungPph21({ bruto: 10_000_000, iuran_pegawai: 0, status_ptkp: "TK/0", pegawai_tetap: true, masa_terakhir: false }, s).pph21).toBe(200_000);
  });
  it("K/1 bruto 10 jt → 1,5% = Rp 150.000", () => {
    expect(hitungPph21({ bruto: 10_000_000, iuran_pegawai: 0, status_ptkp: "K/1", pegawai_tetap: true, masa_terakhir: false }, s).pph21).toBe(150_000);
  });
  it("K/3 bruto 8 jt → 1% = Rp 80.000", () => {
    expect(hitungPph21({ bruto: 8_000_000, iuran_pegawai: 0, status_ptkp: "K/3", pegawai_tetap: true, masa_terakhir: false }, s).pph21).toBe(80_000);
  });
  it("pegawai tidak tetap tetap memakai TER walau Desember", () => {
    const r = hitungPph21({ bruto: 10_000_000, iuran_pegawai: 0, status_ptkp: "TK/0", pegawai_tetap: false, masa_terakhir: true }, s);
    expect(r.metode).toBe("TER");
    expect(r.pph21).toBe(200_000);
  });
});

describe("Pasal 17 & masa terakhir", () => {
  it("lapisan progresif: PKP 300 jt = 3 jt + 28,5 jt + 12,5 jt", () => {
    expect(pajakPasal17(300_000_000, s)).toBe(44_000_000);
  });
  it("Desember: PPh setahun − PPh Jan–Nov", () => {
    // Bruto 10 jt/bulan, iuran JHT+JP 300 rb/bulan, TK/0
    const r = hitungPph21(
      { bruto: 10_000_000, iuran_pegawai: 300_000, status_ptkp: "TK/0", pegawai_tetap: true, masa_terakhir: true, sebelumnya: { bruto: 110_000_000, iuran_pegawai: 3_300_000, pph21: 2_200_000, bulan: 11 } },
      s,
    );
    // neto = 120 jt − 6 jt − 3,6 jt = 110,4 jt; PKP = 56,4 jt; PPh setahun 5% = 2.820.000
    expect(r.setahun?.pkp).toBe(56_400_000);
    expect(r.setahun?.pph_setahun).toBe(2_820_000);
    expect(r.pph21).toBe(620_000);
  });
  it("lebih potong di masa terakhir menghasilkan PPh negatif (dikembalikan)", () => {
    const r = hitungPph21(
      { bruto: 5_000_000, iuran_pegawai: 150_000, status_ptkp: "K/0", pegawai_tetap: true, masa_terakhir: true, sebelumnya: { bruto: 25_000_000, iuran_pegawai: 750_000, pph21: 100_000, bulan: 5 } },
      s,
    );
    expect(r.setahun?.pkp).toBe(0);
    expect(r.pph21).toBe(-100_000);
  });
  it("biaya jabatan dibatasi 500 rb × jumlah bulan", () => {
    const r = hitungPph21({ bruto: 20_000_000, iuran_pegawai: 0, status_ptkp: "TK/0", pegawai_tetap: true, masa_terakhir: true, sebelumnya: { bruto: 20_000_000, iuran_pegawai: 0, pph21: 0, bulan: 1 } }, s);
    expect(r.setahun?.biaya_jabatan).toBe(1_000_000);
  });
});

describe("Gross-up", () => {
  it("tunjangan PPh ≥ PPh atas (bruto + tunjangan)", () => {
    const g = hitungPph21GrossUp({ bruto: 10_000_000, iuran_pegawai: 0, status_ptkp: "TK/0", pegawai_tetap: true, masa_terakhir: false }, s);
    expect(g.tunjangan_pph).toBeGreaterThanOrEqual(g.pph21);
    expect(g.pph21).toBe(Math.floor((10_000_000 + g.tunjangan_pph) * tarifTER(10_000_000 + g.tunjangan_pph, "A", s)));
  });
});

describe("Integrasi payroll", () => {
  const periode = { mulai: "2026-09-01", selesai: "2026-09-30" };
  const rekap = { hari_hadir: 2, hari_hadir_kerja: 1, jam_aktual: 21, jam_normal: 8, jam_lembur: 13, jam_konversi: 28.5 };
  const base = { periode, karyawan: { tanggal_masuk: "2026-01-01" }, gaji_pokok: 5_000_000, basis_gaji: "bulanan" as const, tunjangan: [], rekap, pajak: { status_ptkp: "TK/0", pegawai_tetap: true, masa_terakhir: false } };

  it("bruto PPh 21 = gaji + lembur + premi BPJS Kes, JKK, JKM perusahaan; dipotong dari THP", () => {
    const st = mergeSettings([{ key: "payroll", value: { pph21_mode: "dipotong_karyawan" } }]);
    const r = hitungPayroll(base, st);
    expect(r.bruto_pph21).toBe(5_000_000 + 823_699 + 200_000 + 44_500 + 15_000);
    expect(r.pph21).toBe(Math.floor(6_083_199 * 0.0075));
    expect(r.take_home_pay).toBe(r.bruto - r.bpjs_karyawan.total - r.pph21);
  });
  it("ditanggung perusahaan: tidak mengurangi THP, menambah biaya", () => {
    const st = mergeSettings([{ key: "payroll", value: { pph21_mode: "ditanggung_perusahaan" } }]);
    const r = hitungPayroll(base, st);
    expect(r.take_home_pay).toBe(r.bruto - r.bpjs_karyawan.total);
    expect(r.biaya_perusahaan).toBe(r.bruto + r.bpjs_perusahaan.total + r.thr_cadangan + r.kompensasi_cadangan + r.pph21);
  });
  it("gross-up: THP tidak berkurang karena pajak", () => {
    const st = mergeSettings([{ key: "payroll", value: { pph21_mode: "gross_up" } }]);
    const r = hitungPayroll(base, st);
    expect(r.tunjangan_pph).toBeGreaterThan(0);
    expect(r.take_home_pay).toBe(r.bruto - r.bpjs_karyawan.total + r.tunjangan_pph - r.pph21);
    expect(r.take_home_pay).toBeGreaterThanOrEqual(r.bruto - r.bpjs_karyawan.total);
  });
  it("mode default tidak menghitung PPh", () => {
    expect(hitungPayroll(base, DEFAULT_SETTINGS).pph21).toBe(0);
  });
});
