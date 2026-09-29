# Dashboard Manpower Supply – Proyek Pabrik Soda Ash Bontang

Aplikasi web online, responsif (HP/tablet/laptop, bisa dipasang sebagai PWA), multi-role, untuk memonitor
**data karyawan**, **absensi & lembur (jam konversi Disnaker)**, **cost operasional**, serta **profit & arus kas**
kontraktor manpower supply.

- Bahasa Indonesia · Rupiah `Rp 1.234.567` · tanggal `DD/MM/YYYY` · zona waktu WITA (Asia/Makassar)
- Stack: **Next.js 15 (App Router) + Tailwind CSS 4** · **Supabase** (PostgreSQL + Auth + RLS + Storage) · Recharts · ExcelJS · jsPDF

---

## 1. Fitur per modul

| Modul | Isi |
| --- | --- |
| Login & role | Login dengan **NIK / No. HP / email** + password; akun karyawan dibuat otomatis (password awal acak, **wajib diganti** saat login pertama); lupa password via email atau reset oleh Admin; sesi otomatis berakhir **8 jam**; log setiap login. |
| Karyawan | Master data lengkap (pribadi, kontrak PKWT/Harian, klasifikasi, area, regu, BPJS, NPWP/PTKP, rekening, APD, MCU, sertifikat, dokumen), riwayat gaji & klasifikasi otomatis, kartu ringkasan, histogram manpower 12 bulan, filter/sort/cari, export Excel/PDF, **import Excel** dengan template & laporan baris gagal. |
| Klasifikasi & rate | Rate tagihan per jam dengan **tanggal efektif** (adendum), histori tersimpan. |
| Absensi & lembur | Input harian per regu dari HP (pilih regu → status → jam → simpan), hitung otomatis jam normal / lembur aktual / **jam konversi** di database, peringatan batas PP 35/2021, approval & penguncian, rekap per karyawan/klasifikasi/regu/area, Top 10, tren harian & mingguan, kalender absensi berwarna. |
| Payroll | Prorata (hari kalender/30 atau hari kerja), tunjangan tetap/tidak tetap (bulanan/harian), upah lembur, BPJS (Kes, JKK, JKM, JHT, JP + batas upah), cadangan THR & kompensasi PKWT, **PPh 21 otomatis tarif TER** (dipotong / ditanggung / gross-up), potongan kasbon, **kunci periode = snapshot**, slip gaji PDF, export Excel + daftar transfer bank. |
| Cost operasional | Biaya tenaga kerja otomatis dari payroll + biaya non-gaji manual (kategori bisa ditambah, upload foto nota dari HP), donat komposisi, tren, cost/karyawan, cost/jam, **budget vs aktual**. |
| Invoice | Man-hour: Σ **jam aktual** × rate klasifikasi yang berlaku pada tanggal kerja, hanya timesheet approved; PPN (DPP nilai lain) & PPh 23; status Draft → Terkirim → Disetujui → Dibayar sebagian → Lunas; pembayaran otomatis masuk arus kas; lampiran per klasifikasi & per karyawan (Excel/PDF); pencegahan tagihan ganda. |
| Profit | Laba-rugi bulanan & kumulatif, **margin per klasifikasi** (tagihan jam aktual vs biaya dengan jam konversi), alert bila di bawah target. |
| Arus kas | Buku kas & saldo berjalan, proyeksi 90 hari (piutang jatuh tempo vs payroll), aging piutang 0–30/31–60/61–90/>90, **rekonsiliasi payroll vs transfer bank**, estimasi kebutuhan modal kerja. |
| Dashboard | Admin: 8 KPI, grafik, tabel **Perlu tindakan**, filter global (periode, klasifikasi, area, supervisor). Supervisor: regu, kehadiran hari ini, tombol cepat input, status approval (tanpa Rupiah). Karyawan: jam & lembur, estimasi upah lembur, slip gaji, masa berlaku kontrak/sertifikat. |
| Sistem | Pengaturan (semua angka regulasi di tabel `settings`), kalender libur nasional & cuti bersama, manajemen pengguna, **audit log** (nilai lama → baru) untuk semua tabel penting. |

### Hak akses (ditegakkan di database — Row Level Security)

| Data | Super Admin | Admin | Supervisor | Karyawan |
| --- | --- | --- | --- | --- |
| Kelola user & role | ✅ | ❌ | ❌ | ❌ |
| Master karyawan | ✅ | ✅ | 👁️ tim sendiri, **tanpa gaji** | 👁️ diri sendiri |
| Input absensi | ✅ | ✅ | ✅ tim sendiri | ❌ |
| Approve timesheet | ✅ | ✅ | ❌ | ❌ |
| Gaji / upah lembur (Rp) | ✅ | ✅ | ❌ (juga lewat API) | ✅ milik sendiri |
| Slip gaji | ✅ | ✅ | ❌ (kecuali miliknya bila ditautkan) | ✅ milik sendiri, setelah periode dikunci |
| Cost operasional | ✅ | ✅ | ❌ | ❌ |
| Invoice, profit, kas | ✅ | ✅ bila `admin_akses_keuangan` = true | ❌ | ❌ |
| Pengaturan & hari libur | ✅ | ❌ | ❌ | ❌ |
| Audit log | ✅ | 👁️ | ❌ | ❌ |

Gaji disimpan di tabel terpisah (`employee_compensation`, `employee_allowances`, `payroll`) yang **tidak memiliki
policy untuk supervisor**, sehingga walau memanggil REST API langsung dengan token supervisor, hasilnya kosong.
Timesheet yang sudah approved dan periode yang dikunci dijaga oleh trigger database (bukan hanya UI).

---

## 2. Aturan perhitungan

Semua angka di bawah adalah **default** dan dapat diubah Super Admin di menu *Pengaturan* (tidak di-hardcode).

- 5 hari kerja (Sen–Jum), 8 jam normal/hari; Sabtu, Minggu, libur nasional & cuti bersama = seluruh jam lembur.
- Jam istirahat 12:00–13:00 tidak dihitung (bisa diubah / lebih dari satu jendela; shift malam didukung).
- Upah per jam = dasar upah sebulan ÷ 173. Dasar = gaji pokok + tunjangan tetap; bila ada tunjangan tidak tetap dan
  (GP + TT) < 75% total upah → dasar = 75% total upah (dihitung otomatis per karyawan).
- Hari kerja: lembur jam ke-1 ×1,5, jam ke-2 dst ×2. Hari libur: jam 1–8 ×2, jam ke-9 ×3, jam ke-10–12 ×4.
- Upah lembur = Σ jam konversi × upah per jam (dibulatkan ke rupiah).
- Peringatan (bukan blokir): lembur > 4 jam/hari, > 18 jam/minggu, kerja > 12 jam/hari, jam tidak lengkap, bekerja saat status Cuti/Non-aktif.
- Tagihan klien memakai **jam aktual** (normal + lembur aktual, tanpa pengali) × rate yang berlaku pada tanggal kerja.

Contoh spesifikasi 5.5 diuji otomatis (`npm test` dan `npm run test:db`):

| Kasus | Jam aktual | Jam konversi | Upah lembur (GP Rp 5.000.000) |
| --- | --- | --- | --- |
| Rabu 07:00–19:00, istirahat 1 jam | 11 | 1,5 + 2 + 2 = **5,5** | **Rp 158.960** |
| Sabtu 10 jam | 10 | 8×2 + 1×3 + 1×4 = **23** | **Rp 664.740** |

### PPh 21 (PP 58/2023, PMK 168/2023)

- Mode di *Pengaturan → Payroll*: tidak dihitung · dipotong dari karyawan · ditanggung perusahaan · gross-up (tunjangan PPh).
- **Bruto** = gaji + tunjangan + upah lembur (+ tunjangan PPh bila gross-up) + premi BPJS Kesehatan, JKK & JKM yang dibayar perusahaan.
- **Januari–November**: TER bulanan × bruto. Kategori dari status PTKP karyawan: A = TK/0, TK/1, K/0 · B = TK/2, TK/3, K/1, K/2 · C = K/3 (kosong = TK/0).
- **Desember atau bulan terakhir bekerja** (pegawai tetap/PKWT): bruto setahun − biaya jabatan (5%, maks. Rp 500.000 × jumlah bulan) − iuran JHT & JP karyawan − PTKP →
  PKP (dibulatkan ribuan) × tarif Pasal 17 (5/15/25/30/35%), dikurangi PPh yang sudah dipotong Jan–Nov. Hasil negatif = lebih potong, dikembalikan ke karyawan.
- Karyawan kontrak **Harian** diperlakukan sebagai pegawai tidak tetap yang dibayar bulanan: TER bulanan tanpa perhitungan setahun.
- Rincian (metode, kategori, tarif TER, perhitungan setahun) disimpan di snapshot payroll (`detail.pph21`) dan tampil di slip gaji.
- Belum dicakup: tarif 20% lebih tinggi bagi yang tidak memiliki NPWP/NIK terintegrasi, TER harian, dan penghasilan dari pemberi kerja lain dalam tahun yang sama.
  **Verifikasi tabel TER dengan lampiran PP 58/2023 sebelum dipakai produksi**; tabel dapat diperbarui di pengaturan `pph21`.

Jam dihitung oleh **trigger PostgreSQL** (`app.timesheet_before`) sehingga tidak bisa dimanipulasi dari API; kode
TypeScript (`src/lib/calc`) memakai rumus yang sama untuk pratinjau di form & perhitungan payroll.

---

## 3. Instalasi

### 3.1 Supabase (region Singapore)

1. Buat 2 project Supabase: **staging** dan **production** (region `ap-southeast-1`).
2. Jalankan migrasi berurutan di SQL Editor (atau `supabase db push` bila memakai Supabase CLI):
   `supabase/migrations/20260929000001_schema.sql`, `..._functions.sql`, `..._storage.sql`, lalu `supabase/seed.sql`.
3. **Authentication → Providers → Email**: aktifkan; matikan *Allow new users to sign up* (akun hanya dibuat Admin).
   **Authentication → URL Configuration**: isi *Site URL* = domain aplikasi, tambahkan `https://[domain]/auth/callback` ke *Redirect URLs*.
   Isi SMTP (Settings → Auth → SMTP) agar email reset password terkirim.
4. **Settings → API → Max rows**: biarkan 1000 (aplikasi sudah melakukan paginasi untuk ≥ 1.000 karyawan).
5. **Backup harian**: aktif otomatis pada plan Pro (Point-in-Time Recovery opsional). Untuk plan Free, jadwalkan
   `pg_dump` harian (mis. GitHub Actions) — lihat bagian 6.
6. Buat Super Admin pertama:
   - Authentication → Users → *Add user* (email + password, centang *Auto confirm*).
   - SQL Editor:
     ```sql
     insert into public.profiles (id, role, full_name, email, must_change_password)
     select id, 'super_admin', 'Nama Super Admin', email, false from auth.users where email = 'admin@domain.com';
     ```

### 3.2 Aplikasi (Vercel)

1. Import repository ke Vercel. Buat 2 environment (Preview = staging, Production).
2. Isi Environment Variables (lihat `.env.example`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**rahasia, server saja**),
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_NAME`.
3. Hubungkan domain sendiri → HTTPS otomatis.

### 3.3 Development lokal

```bash
npm install
cp .env.example .env.local   # isi dengan project Supabase staging
npm run dev                   # http://localhost:3000
npm test                      # unit test rumus (vitest)
npm run test:db               # migrasi + uji RLS/trigger di PostgreSQL lokal (butuh binary postgres)
```

---

## 4. Alur kerja harian

1. **Admin**: isi Pengaturan (identitas proyek, cut-off, BPJS/JKK, PPN, target margin), hari libur, klasifikasi & rate, area, regu (+ user supervisor), lalu import karyawan.
2. **Supervisor** (HP): menu *Input Absensi* → pilih regu & tanggal → set jam → Simpan. Status otomatis *Menunggu approval*.
3. **Admin**: *Approval* → cek peringatan → Approve (per baris / massal). Approved = terkunci.
4. Akhir periode: *Payroll* → buat periode → Hitung → isi PPh 21/kasbon bila perlu → **Kunci periode** → karyawan bisa unduh slip. Catat transfer gaji di *Arus Kas* (pilih periode → rekonsiliasi).
5. *Invoice* → buat draft dari periode → export lampiran → Tandai terkirim → catat pembayaran.
6. Pantau *Dashboard*, *Profit*, *Arus Kas*.

---

## 5. Struktur kode

```
supabase/migrations/     skema, RLS, trigger, fungsi agregasi (RPC), storage
supabase/seed.sql        pengaturan default, kategori biaya, area, klasifikasi contoh, libur nasional tetap
supabase/tests/          uji RLS & perhitungan di database
src/lib/calc/            rumus lembur, payroll, invoice (+ unit test)
src/app/(app)/           halaman per modul (Server Components + Server Actions)
src/components/          UI, grafik, export, slip PDF
src/middleware.ts        proteksi rute & timeout sesi 8 jam
```

Tabel utama: `profiles` (users & roles) · `employees` · `employee_compensation` · `employee_allowances` ·
`employee_salary_history` · `employee_certificates` · `employee_documents` · `classifications` · `classification_rates` ·
`areas` · `teams` · `holidays` · `settings` · `payroll_periods` · `timesheets` · `payroll` · `cost_categories` ·
`expenses` · `budgets` · `invoices` · `invoice_lines` · `payments` · `cash_transactions` · `audit_logs` · `login_logs`.

Snapshot: timesheet menyimpan klasifikasi & jam hasil hitung; payroll menyimpan seluruh komponen + parameter yang
dipakai (`detail`); invoice menyimpan rate per baris & parameter pajak (`pajak_snapshot`). Perubahan gaji/rate
di kemudian hari tidak mengubah laporan periode yang sudah dikunci.

---

## 6. Catatan operasional

- **Import besar**: import ±200 baris per file bila sekaligus membuat akun login (pembuatan akun dilakukan per baris).
- **Mode offline input absensi**: setelah halaman *Input Absensi* pernah dibuka online, halaman itu bisa dibuka tanpa sinyal
  (service worker). Ganti tanggal/regu, isi jam, dan Simpan tetap berjalan; data disimpan di HP (IndexedDB, per akun) dan
  dikirim otomatis saat online (juga dicoba tiap 1 menit). Indikator di header menampilkan jumlah antrean. Timesheet yang
  keburu di-approve di server tidak ditimpa. Data hasil sinkron diberi tanda *offline* + waktu input di halaman Approval.
  Logout menghapus halaman ter-cache (antrean tetap tersimpan untuk akun yang sama). Menu lain tetap butuh sinyal.
- **Backup mandiri** (opsional, di luar backup Supabase): `pg_dump "$SUPABASE_DB_URL" -Fc -f backup-$(date +%F).dump` terjadwal harian.
- Mesin absensi fingerprint: belum terintegrasi; data dapat dimasukkan lewat input massal per regu.

## 7. Data yang perlu disiapkan pemilik proyek `[ISI]`

Nama perusahaan, klien, no. kontrak/PO, domain & logo · daftar klasifikasi + rate per jam · data karyawan (template import) ·
daftar tunjangan (tetap vs tidak tetap) · cut-off payroll & termin pembayaran klien · tingkat risiko JKK & kebijakan PPh 21 ·
daftar supervisor/regu · kategori biaya & budget · target margin.
