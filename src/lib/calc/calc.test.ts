import { describe, expect, it } from "vitest";
import { applyTiers, cekBatasMingguan, dasarUpahLembur, hitungJamHarian, jamKerjaBersih, upahLembur, upahPerJam } from "./overtime";
import { faktorProrata, hitungPayroll, rekapDariHari } from "./payroll";
import { agingBucket, hitungPajakInvoice, rateBerlaku, susunBarisTagihan } from "./invoice";
import { DEFAULT_OVERTIME, DEFAULT_SETTINGS, mergeSettings } from "./settings";

const s = DEFAULT_OVERTIME;
const gaji5jt = { gaji_pokok: 5_000_000, tunjangan_tetap: 0, tunjangan_tidak_tetap: 0 };

describe("Contoh perhitungan spesifikasi 5.5", () => {
  it("upah per jam = 5.000.000 / 173", () => {
    expect(upahPerJam(gaji5jt, s).toFixed(2)).toBe("28901.73");
  });

  it("Rabu 07:00–19:00, istirahat 1 jam → 8 normal + 3 lembur, konversi 5,5, Rp 158.960", () => {
    const h = hitungJamHarian({ tanggal: "2026-09-30", jam_masuk: "07:00", jam_keluar: "19:00" }, s);
    expect(h.tipe_hari).toBe("kerja");
    expect(h.jam_aktual).toBe(11); // jam tagihan ke klien
    expect(h.jam_normal).toBe(8);
    expect(h.jam_lembur).toBe(3);
    expect(h.jam_konversi).toBe(5.5);
    expect(upahLembur(h.jam_konversi, gaji5jt, s)).toBe(158_960);
  });

  it("Sabtu kerja 10 jam → konversi 23, Rp 664.740", () => {
    const h = hitungJamHarian({ tanggal: "2026-10-03", jam_masuk: "07:00", jam_keluar: "18:00" }, s);
    expect(h.tipe_hari).toBe("libur");
    expect(h.jam_aktual).toBe(10);
    expect(h.jam_normal).toBe(0);
    expect(h.jam_lembur).toBe(10);
    expect(h.jam_konversi).toBe(23);
    expect(upahLembur(h.jam_konversi, gaji5jt, s)).toBe(664_740);
  });

  it("Hari libur nasional di hari Senin dihitung sebagai hari libur", () => {
    const h = hitungJamHarian({ tanggal: "2026-08-17", jam_masuk: "07:00", jam_keluar: "16:00" }, s, ["2026-08-17"]);
    expect(h.tipe_hari).toBe("libur");
    expect(h.jam_aktual).toBe(8);
    expect(h.jam_konversi).toBe(16);
  });
});

describe("Jam kerja & pengali", () => {
  it("hari kerja 8 jam tepat tidak ada lembur", () => {
    const h = hitungJamHarian({ tanggal: "2026-09-30", jam_masuk: "07:00", jam_keluar: "16:00" }, s);
    expect([h.jam_aktual, h.jam_lembur, h.jam_konversi]).toEqual([8, 0, 0]);
  });

  it("lembur pecahan: 1,5 jam = 1×1,5 + 0,5×2", () => {
    expect(applyTiers(1.5, s.pengali_hari_kerja)).toBe(2.5);
  });

  it("hari libur 12 jam = 8×2 + 1×3 + 3×4 = 31", () => {
    expect(applyTiers(12, s.pengali_hari_libur)).toBe(31);
  });

  it("shift malam melewati tengah malam", () => {
    expect(jamKerjaBersih("19:00", "07:00", s.jam_istirahat)).toBe(12);
  });

  it("peringatan lembur > 4 jam & > 12 jam", () => {
    const h = hitungJamHarian({ tanggal: "2026-09-30", jam_masuk: "06:00", jam_keluar: "20:00" }, s);
    expect(h.jam_aktual).toBe(13);
    expect(h.peringatan.length).toBe(2);
  });

  it("jam tidak lengkap menghasilkan peringatan", () => {
    const h = hitungJamHarian({ tanggal: "2026-09-30", jam_masuk: "07:00", jam_keluar: null }, s);
    expect(h.jam_aktual).toBe(0);
    expect(h.peringatan).toContain("Jam masuk/keluar tidak lengkap");
  });

  it("batas lembur mingguan 18 jam", () => {
    const hari = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map((t) => ({ tanggal: t, tipe_hari: "kerja" as const, jam_lembur: 4 }));
    expect(cekBatasMingguan(hari, s)).toEqual([{ minggu: "2026-09-28", total: 20 }]);
  });
});

describe("Dasar upah lembur", () => {
  it("GP + TT bila tidak ada tunjangan tidak tetap", () => {
    expect(dasarUpahLembur({ gaji_pokok: 4_000_000, tunjangan_tetap: 1_000_000, tunjangan_tidak_tetap: 0 }, s).dasar).toBe(5_000_000);
  });
  it("75% total upah bila GP + TT < 75%", () => {
    const r = dasarUpahLembur({ gaji_pokok: 3_000_000, tunjangan_tetap: 0, tunjangan_tidak_tetap: 2_000_000 }, s);
    expect(r.dasar).toBe(3_750_000);
    expect(r.metode).toBe("75% total upah");
  });
  it("GP + TT bila sudah ≥ 75%", () => {
    expect(dasarUpahLembur({ gaji_pokok: 4_000_000, tunjangan_tetap: 0, tunjangan_tidak_tetap: 1_000_000 }, s).dasar).toBe(4_000_000);
  });
});

describe("Payroll", () => {
  const periode = { mulai: "2026-09-01", selesai: "2026-09-30" };
  const hari = [
    { tanggal: "2026-09-30", status_kehadiran: "hadir", tipe_hari: "kerja" as const, jam_aktual: 11, jam_normal: 8, jam_lembur: 3, jam_konversi: 5.5 },
    { tanggal: "2026-09-26", status_kehadiran: "hadir", tipe_hari: "libur" as const, jam_aktual: 10, jam_normal: 0, jam_lembur: 10, jam_konversi: 23 },
  ];

  it("gaji penuh + lembur + BPJS", () => {
    const r = hitungPayroll(
      { periode, karyawan: { tanggal_masuk: "2026-01-01" }, gaji_pokok: 5_000_000, basis_gaji: "bulanan", tunjangan: [], rekap: rekapDariHari(hari) },
      DEFAULT_SETTINGS,
    );
    expect(r.gaji_pokok).toBe(5_000_000);
    expect(r.jam_konversi).toBe(28.5);
    expect(r.upah_lembur).toBe(Math.round(28.5 * (5_000_000 / 173)));
    expect(r.bpjs_perusahaan.kes).toBe(200_000);
    expect(r.bpjs_perusahaan.jht).toBe(185_000);
    expect(r.bpjs_perusahaan.jp).toBe(100_000);
    expect(r.bpjs_perusahaan.jkm).toBe(15_000);
    expect(r.bpjs_karyawan.total).toBe(50_000 + 100_000 + 50_000);
    expect(r.thr_cadangan).toBe(416_667);
    expect(r.take_home_pay).toBe(r.bruto - r.bpjs_karyawan.total);
    expect(r.biaya_perusahaan).toBe(r.bruto + r.bpjs_perusahaan.total + r.thr_cadangan + r.kompensasi_cadangan);
  });

  it("prorata kalender/30 untuk karyawan masuk tengah periode", () => {
    const f = faktorProrata({ periode, karyawan: { tanggal_masuk: "2026-09-16" } }, DEFAULT_SETTINGS);
    expect(f).toBe(0.5);
  });

  it("prorata hari kerja", () => {
    const st = mergeSettings([{ key: "payroll", value: { prorata_metode: "hari_kerja", prorata_pembagi_hari_kerja: 21 } }]);
    // 16–30 Sep 2026: 11 hari kerja
    expect(faktorProrata({ periode, karyawan: { tanggal_masuk: "2026-09-16" } }, st)).toBeCloseTo(11 / 21);
  });

  it("tunjangan harian dikali hari hadir, tunjangan tidak tetap memengaruhi dasar lembur", () => {
    const r = hitungPayroll(
      {
        periode,
        karyawan: { tanggal_masuk: "2026-01-01" },
        gaji_pokok: 3_000_000,
        basis_gaji: "bulanan",
        tunjangan: [{ nama: "Makan", jenis: "tidak_tetap", basis: "harian", jumlah: 100_000 }],
        rekap: rekapDariHari(hari),
      },
      DEFAULT_SETTINGS,
    );
    expect(r.tunjangan_tidak_tetap).toBe(200_000);
    // total = 3.000.000 + 2.100.000; GP = 58,8% < 75% → dasar 75% × 5.100.000
    expect(r.dasar_upah_lembur).toBe(3_825_000);
  });
});

describe("Invoice man-hour", () => {
  const rates = [
    { classification_id: "welder", rate_per_jam: 100_000, berlaku_mulai: "2026-01-01" },
    { classification_id: "welder", rate_per_jam: 110_000, berlaku_mulai: "2026-09-15" },
  ];
  it("rate mengikuti tanggal efektif", () => {
    expect(rateBerlaku(rates, "welder", "2026-09-14")).toBe(100_000);
    expect(rateBerlaku(rates, "welder", "2026-09-15")).toBe(110_000);
    expect(rateBerlaku(rates, "welder", "2025-12-31")).toBeNull();
  });
  it("nilai tagihan = Σ jam aktual × rate (tanpa pengali)", () => {
    const { lines } = susunBarisTagihan(
      [
        { employee_id: "a", classification_id: "welder", tanggal: "2026-09-10", jam_aktual: 11 },
        { employee_id: "a", classification_id: "welder", tanggal: "2026-09-19", jam_aktual: 10 },
      ],
      rates,
    );
    const total = lines.reduce((a, l) => a + l.jumlah, 0);
    expect(total).toBe(11 * 100_000 + 10 * 110_000);
  });
  it("PPN 12% DPP nilai lain 11/12 dan PPh 23 2%", () => {
    const t = hitungPajakInvoice(120_000_000, DEFAULT_SETTINGS.pajak);
    expect(t.dpp_ppn).toBe(110_000_000);
    expect(t.ppn).toBe(13_200_000);
    expect(t.pph23).toBe(2_400_000);
    expect(t.total_tagihan).toBe(133_200_000);
  });
  it("aging piutang", () => {
    expect(agingBucket("2026-09-01", "2026-09-29")).toBe("0-30");
    expect(agingBucket("2026-07-01", "2026-09-29")).toBe("61-90");
    expect(agingBucket("2026-01-01", "2026-09-29")).toBe(">90");
  });
});
