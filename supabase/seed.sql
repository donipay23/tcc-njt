-- Data awal. Nilai bertanda [ISI] wajib disesuaikan pemilik proyek.

insert into public.settings (key, value, keterangan) values
('lembur', '{
  "pembagi_upah_jam": 173,
  "jam_normal_harian": 8,
  "pengali_hari_kerja": [{"sampai": 1, "pengali": 1.5}, {"sampai": null, "pengali": 2}],
  "pengali_hari_libur": [{"sampai": 8, "pengali": 2}, {"sampai": 9, "pengali": 3}, {"sampai": null, "pengali": 4}],
  "jam_istirahat": [{"mulai": "12:00", "selesai": "13:00"}],
  "hari_kerja": [1, 2, 3, 4, 5],
  "batas_lembur_harian": 4,
  "batas_lembur_mingguan": 18,
  "batas_jam_kerja_harian": 12,
  "rasio_upah_tetap_minimum": 0.75
}', 'Aturan lembur KEP-102/MEN/VI/2004 jo. PP 35/2021'),
('bpjs', '{
  "kes_perusahaan": 0.04, "kes_karyawan": 0.01, "kes_batas_upah": 12000000,
  "jkk": 0.0089, "jkm": 0.003,
  "jht_perusahaan": 0.037, "jht_karyawan": 0.02,
  "jp_perusahaan": 0.02, "jp_karyawan": 0.01, "jp_batas_upah": 10547400
}', 'Tarif & batas upah BPJS. [ISI] tingkat risiko JKK, batas upah JP tahun berjalan'),
('payroll', '{
  "prorata_metode": "kalender_30",
  "prorata_pembagi_hari_kerja": null,
  "thr_cadangan": true,
  "kompensasi_pkwt_cadangan": true,
  "pph21_mode": "tidak_dihitung"
}', '[ISI] metode prorata & kebijakan PPh 21'),
('pajak', '{"ppn_tarif": 0.12, "ppn_dpp_faktor": 0.9166666667, "pph23_tarif": 0.02, "termin_hari": 30}',
  '[ISI] PPN, DPP nilai lain, PPh 23, termin pembayaran (TOP)'),
('periode', '{"tanggal_mulai": 1}', 'Tanggal awal periode cut-off (1 = tanggal 1 s/d akhir bulan, 21 = 21 s/d 20)'),
('perusahaan', '{"nama": "[ISI Nama Kontraktor]", "klien": "[ISI Nama Klien]", "no_kontrak": "[ISI]", "domain_email_karyawan": "karyawan.local"}', 'Identitas proyek'),
('target_margin', '0.15', 'Target margin profit (desimal)'),
('admin_akses_keuangan', 'true', 'Admin boleh melihat invoice, profit & arus kas')
on conflict (key) do nothing;

insert into public.cost_categories (nama) values
('Mess/akomodasi'), ('Transport/mobilisasi'), ('Makan/catering'), ('APD & seragam'), ('MCU'),
('Sertifikasi & training'), ('Tiket mobilisasi/demobilisasi'), ('Operasional kantor site'), ('Alat kerja'),
('Asuransi'), ('Fee/komisi'), ('Pajak & administrasi bank'), ('Lain-lain')
on conflict (nama) do nothing;

insert into public.areas (nama) values ('Civil'), ('Mechanical'), ('Piping'), ('E&I'), ('HSE'), ('Umum')
on conflict (nama) do nothing;

-- [ISI] klasifikasi & rate tagihan sebenarnya (rate diinput di menu Klasifikasi)
insert into public.classifications (kode, nama) values
('SPV', 'Supervisor'), ('FRM', 'Foreman'), ('WLD6G', 'Welder 6G'), ('FIT', 'Fitter'), ('RIG', 'Rigger'),
('SCF', 'Scaffolder'), ('HLP', 'Helper'), ('HSE', 'HSE Officer')
on conflict (kode) do nothing;

-- Libur nasional tanggal tetap 2026. Libur keagamaan & cuti bersama mengikuti SKB 3 Menteri —
-- tambahkan lewat menu Pengaturan → Hari Libur.
insert into public.holidays (tanggal, nama) values
('2026-01-01', 'Tahun Baru Masehi'), ('2026-05-01', 'Hari Buruh Internasional'),
('2026-06-01', 'Hari Lahir Pancasila'), ('2026-08-17', 'Hari Kemerdekaan RI'), ('2026-12-25', 'Hari Raya Natal')
on conflict (tanggal) do nothing;
