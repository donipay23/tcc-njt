-- =====================================================================
-- Dashboard Manpower Supply – Proyek Pabrik Soda Ash Bontang
-- Skema inti: tabel, fungsi hak akses, trigger hitung jam, audit log, RLS
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'admin', 'supervisor', 'karyawan');
create type public.employee_status as enum ('aktif', 'cuti', 'non_aktif', 'resign', 'selesai_kontrak');
create type public.contract_type as enum ('PKWT', 'Harian');
create type public.salary_basis as enum ('bulanan', 'harian');
create type public.attendance_status as enum ('hadir', 'sakit', 'izin', 'alpa', 'cuti', 'libur');
create type public.approval_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.period_status as enum ('open', 'locked');
create type public.invoice_status as enum ('draft', 'terkirim', 'disetujui', 'dibayar_sebagian', 'lunas');
create type public.expense_status as enum ('rencana', 'dibayar');
create type public.cash_direction as enum ('masuk', 'keluar');

-- ---------------------------------------------------------------------
-- MASTER
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'karyawan',
  full_name text not null,
  email text not null unique,          -- email login (bisa email sintetis untuk karyawan tanpa email)
  phone text unique,
  employee_id uuid,                    -- FK ditambahkan setelah tabel employees
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classifications (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  nama text not null,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classification_rates (
  id uuid primary key default gen_random_uuid(),
  classification_id uuid not null references public.classifications (id) on delete cascade,
  rate_per_jam numeric(14, 2) not null check (rate_per_jam >= 0),
  berlaku_mulai date not null,
  keterangan text,                     -- mis. "Adendum 1"
  created_at timestamptz not null default now(),
  unique (classification_id, berlaku_mulai)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  supervisor_id uuid references public.profiles (id) on delete set null,
  area_id uuid references public.areas (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.employee_nik_seq start 1;

-- Data karyawan NON-gaji (boleh dilihat supervisor untuk timnya)
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  nik text not null unique default ('MPS-' || lpad(nextval('public.employee_nik_seq')::text, 5, '0')),
  no_ktp text unique,
  nama text not null,
  jenis_kelamin text check (jenis_kelamin in ('L', 'P')),
  tempat_lahir text,
  tanggal_lahir date,
  alamat_ktp text,
  alamat_domisili text,
  no_hp text,
  email text,
  kontak_darurat_nama text,
  kontak_darurat_hubungan text,
  kontak_darurat_hp text,
  tanggal_masuk date not null,
  tanggal_keluar date,
  status public.employee_status not null default 'aktif',
  jenis_kontrak public.contract_type not null default 'PKWT',
  no_kontrak text,
  tanggal_akhir_kontrak date,
  classification_id uuid references public.classifications (id),
  area_id uuid references public.areas (id),
  team_id uuid references public.teams (id) on delete set null,
  no_bpjs_kesehatan text,
  no_bpjs_ketenagakerjaan text,
  mcu_tanggal date,
  mcu_berlaku_sampai date,
  ukuran_baju text,
  ukuran_sepatu text,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.employees (team_id);
create index on public.employees (classification_id);
create index on public.employees (status);

alter table public.profiles
  add constraint profiles_employee_fk foreign key (employee_id) references public.employees (id) on delete set null;
create unique index profiles_employee_unique on public.profiles (employee_id) where employee_id is not null;

-- Data gaji & rahasia (TIDAK boleh dilihat supervisor)
create table public.employee_compensation (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  basis_gaji public.salary_basis not null default 'bulanan',
  gaji_pokok numeric(14, 2) not null default 0 check (gaji_pokok >= 0),
  npwp text,
  status_ptkp text,                     -- TK/0, K/1, dst.
  bank_nama text,
  no_rekening text,
  nama_rekening text,
  updated_at timestamptz not null default now()
);

create table public.employee_allowances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  nama text not null,
  jenis text not null check (jenis in ('tetap', 'tidak_tetap')),
  basis text not null default 'bulanan' check (basis in ('bulanan', 'harian')),
  jumlah numeric(14, 2) not null check (jumlah >= 0),
  created_at timestamptz not null default now()
);
create index on public.employee_allowances (employee_id);

create table public.employee_salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  berlaku_mulai date not null default current_date,
  gaji_pokok numeric(14, 2),
  classification_id uuid references public.classifications (id),
  keterangan text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.employee_salary_history (employee_id);

create table public.employee_certificates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  nama text not null,
  nomor text,
  berlaku_sampai date,
  created_at timestamptz not null default now()
);
create index on public.employee_certificates (employee_id);

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  jenis text not null,                  -- foto, ktp, kk, sertifikat, kontrak, lainnya
  nama_file text not null,
  storage_path text not null,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.holidays (
  tanggal date primary key,
  nama text not null,
  jenis text not null default 'libur_nasional' check (jenis in ('libur_nasional', 'cuti_bersama'))
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  keterangan text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ABSENSI & PAYROLL
-- ---------------------------------------------------------------------
create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  mulai date not null,
  selesai date not null,
  tanggal_bayar date,
  status public.period_status not null default 'open',
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz not null default now(),
  check (selesai >= mulai)
);
create index on public.payroll_periods (mulai, selesai);

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  tanggal date not null,
  status_kehadiran public.attendance_status not null default 'hadir',
  jam_masuk time,
  jam_keluar time,
  lokasi text,
  keterangan text,
  -- dihitung otomatis oleh trigger (tidak bisa dimanipulasi lewat API)
  classification_id uuid references public.classifications (id),
  tipe_hari text not null default 'kerja' check (tipe_hari in ('kerja', 'libur')),
  jam_aktual numeric(5, 2) not null default 0,
  jam_normal numeric(5, 2) not null default 0,
  jam_lembur numeric(5, 2) not null default 0,
  jam_konversi numeric(6, 2) not null default 0,
  peringatan text[] not null default '{}',
  approval_status public.approval_status not null default 'submitted',
  approved_by uuid,
  approved_at timestamptz,
  catatan_approval text,
  input_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, tanggal)
);
create index on public.timesheets (tanggal);
create index on public.timesheets (approval_status);

create table public.payroll (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payroll_periods (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  classification_id uuid references public.classifications (id),
  team_id uuid,
  area_id uuid,
  basis_gaji public.salary_basis not null,
  hari_hadir int not null default 0,
  jam_aktual numeric(7, 2) not null default 0,
  jam_normal numeric(7, 2) not null default 0,
  jam_lembur numeric(7, 2) not null default 0,
  jam_konversi numeric(8, 2) not null default 0,
  faktor_prorata numeric(5, 4) not null default 1,
  gaji_pokok numeric(14, 2) not null default 0,
  tunjangan_tetap numeric(14, 2) not null default 0,
  tunjangan_tidak_tetap numeric(14, 2) not null default 0,
  dasar_upah_lembur numeric(14, 2) not null default 0,
  upah_per_jam numeric(14, 2) not null default 0,
  upah_lembur numeric(14, 2) not null default 0,
  bruto numeric(14, 2) not null default 0,
  bpjs_perusahaan jsonb not null default '{}',
  bpjs_perusahaan_total numeric(14, 2) not null default 0,
  bpjs_karyawan jsonb not null default '{}',
  bpjs_karyawan_total numeric(14, 2) not null default 0,
  thr_cadangan numeric(14, 2) not null default 0,
  kompensasi_cadangan numeric(14, 2) not null default 0,
  pph21 numeric(14, 2) not null default 0,
  potongan_lain numeric(14, 2) not null default 0,
  potongan_keterangan text,
  take_home_pay numeric(14, 2) not null default 0,
  biaya_perusahaan numeric(14, 2) not null default 0,
  detail jsonb not null default '{}',   -- rincian tunjangan, rate dsb. (snapshot)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, employee_id)
);
create index on public.payroll (employee_id);

-- ---------------------------------------------------------------------
-- COST OPERASIONAL
-- ---------------------------------------------------------------------
create table public.cost_categories (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  aktif boolean not null default true
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  category_id uuid not null references public.cost_categories (id),
  deskripsi text not null,
  jumlah numeric(14, 2) not null check (jumlah >= 0),
  vendor text,
  metode_bayar text,
  bukti_path text,
  status public.expense_status not null default 'dibayar',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.expenses (tanggal);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.cost_categories (id) on delete cascade,
  bulan date not null check (extract(day from bulan) = 1),
  jumlah numeric(14, 2) not null default 0,
  unique (category_id, bulan)
);

-- ---------------------------------------------------------------------
-- PENDAPATAN & KAS
-- ---------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  period_id uuid references public.payroll_periods (id),
  periode_mulai date not null,
  periode_selesai date not null,
  tanggal date not null default current_date,
  tanggal_kirim date,
  jatuh_tempo date,
  status public.invoice_status not null default 'draft',
  subtotal numeric(16, 2) not null default 0,
  dpp_ppn numeric(16, 2) not null default 0,
  ppn numeric(16, 2) not null default 0,
  pph23 numeric(16, 2) not null default 0,
  total_tagihan numeric(16, 2) not null default 0,
  total_dibayar numeric(16, 2) not null default 0,
  pajak_snapshot jsonb not null default '{}',
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  employee_id uuid references public.employees (id),
  classification_id uuid references public.classifications (id),
  rate_per_jam numeric(14, 2) not null,
  jam_aktual numeric(8, 2) not null,
  jumlah numeric(16, 2) not null
);
create index on public.invoice_lines (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  tanggal date not null,
  jumlah numeric(16, 2) not null check (jumlah > 0),
  pph23_dipotong numeric(16, 2) not null default 0,
  keterangan text,
  created_at timestamptz not null default now()
);

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  arah public.cash_direction not null,
  kategori text not null check (kategori in (
    'pembayaran_invoice', 'modal', 'pinjaman', 'payroll', 'bpjs', 'pajak', 'biaya_non_gaji',
    'pengembalian_modal', 'pengembalian_pinjaman', 'lainnya')),
  jumlah numeric(16, 2) not null check (jumlah > 0),
  keterangan text,
  period_id uuid references public.payroll_periods (id),
  payment_id uuid references public.payments (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.cash_transactions (tanggal);

-- ---------------------------------------------------------------------
-- LOG
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index on public.audit_logs (table_name, record_id);
create index on public.audit_logs (changed_at desc);

create table public.login_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  identifier text,
  success boolean not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- FUNGSI HAK AKSES (security definer agar tidak rekursif terhadap RLS)
-- =====================================================================
create or replace function app.current_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.current_role() = 'super_admin', false)
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.current_role() in ('super_admin', 'admin'), false)
$$;

create or replace function app.is_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.current_role() = 'supervisor', false)
$$;

create or replace function app.my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where id = auth.uid() and active
$$;

create or replace function app.is_my_team_employee(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees e join public.teams t on t.id = e.team_id
    where e.id = p_employee_id and t.supervisor_id = auth.uid()
  ) and app.is_supervisor()
$$;

-- Admin boleh melihat invoice/profit/kas bila diizinkan di pengaturan
create or replace function app.can_view_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_super_admin() or (
    app.current_role() = 'admin'
    and coalesce((select (value)::text::boolean from public.settings where key = 'admin_akses_keuangan'), true)
  )
$$;

grant execute on all functions in schema app to authenticated;

-- =====================================================================
-- TRIGGER UMUM
-- =====================================================================
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','classifications','teams','employees','employee_compensation',
    'settings','timesheets','payroll','expenses','invoices']
  loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- Audit log: siapa, kapan, nilai lama → nilai baru
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  if tg_op = 'UPDATE' and o - 'updated_at' = n - 'updated_at' then
    return new;
  end if;
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name,
          coalesce(r ->> 'id', r ->> 'employee_id', r ->> 'key', r ->> 'tanggal'),
          tg_op, o, n, auth.uid());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','classifications','classification_rates','areas','teams','employees',
    'employee_compensation','employee_allowances','employee_certificates','employee_documents','holidays',
    'settings','payroll_periods','timesheets','payroll','cost_categories','expenses','budgets','invoices',
    'invoice_lines','payments','cash_transactions']
  loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
end $$;

-- Riwayat gaji & klasifikasi
create or replace function app.salary_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'employee_compensation' then
    if tg_op = 'INSERT' or new.gaji_pokok is distinct from old.gaji_pokok then
      insert into public.employee_salary_history (employee_id, gaji_pokok, classification_id, keterangan)
      select new.employee_id, new.gaji_pokok, e.classification_id,
             case when tg_op = 'INSERT' then 'Gaji awal' else 'Perubahan gaji pokok' end
      from public.employees e where e.id = new.employee_id;
    end if;
  elsif tg_op = 'UPDATE' and new.classification_id is distinct from old.classification_id then
    insert into public.employee_salary_history (employee_id, gaji_pokok, classification_id, keterangan)
    select new.id, c.gaji_pokok, new.classification_id, 'Perubahan klasifikasi'
    from (select 1) x left join public.employee_compensation c on c.employee_id = new.id;
  end if;
  return new;
end $$;

create trigger trg_salary_history after insert or update on public.employee_compensation
  for each row execute function app.salary_history();
create trigger trg_class_history after update on public.employees
  for each row execute function app.salary_history();

-- =====================================================================
-- HITUNG JAM TIMESHEET (sumber kebenaran di database)
-- =====================================================================
create or replace function app.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.settings where key = p_key
$$;

create or replace function app.apply_tiers(p_jam numeric, p_tiers jsonb) returns numeric
language plpgsql immutable as $$
declare
  t jsonb; sisa numeric := p_jam; prev numeric := 0; total numeric := 0;
  cap numeric; used numeric; mult numeric := 1;
begin
  for t in select value from jsonb_array_elements(p_tiers) loop
    exit when sisa <= 0;
    mult := (t ->> 'pengali')::numeric;
    cap := case when t ->> 'sampai' is null then sisa else (t ->> 'sampai')::numeric - prev end;
    used := least(sisa, cap);
    total := total + used * mult;
    sisa := sisa - used;
    if t ->> 'sampai' is not null then prev := (t ->> 'sampai')::numeric; end if;
  end loop;
  if sisa > 0 then total := total + sisa * mult; end if;
  return round(total, 2);
end $$;

create or replace function app.jam_kerja_bersih(p_masuk time, p_keluar time, p_istirahat jsonb) returns numeric
language plpgsql immutable as $$
declare
  s numeric := extract(epoch from p_masuk) / 60;
  e numeric := extract(epoch from p_keluar) / 60;
  m numeric; b jsonb; bs numeric; be numeric; off numeric; ov numeric;
begin
  if e <= s then e := e + 1440; end if;
  m := e - s;
  for b in select value from jsonb_array_elements(coalesce(p_istirahat, '[]')) loop
    bs := extract(epoch from (b ->> 'mulai')::time) / 60;
    be := extract(epoch from (b ->> 'selesai')::time) / 60;
    foreach off in array array[0, 1440]::numeric[] loop
      ov := least(e, be + off) - greatest(s, bs + off);
      if ov > 0 then m := m - ov; end if;
    end loop;
  end loop;
  return round(greatest(m, 0) / 60, 2);
end $$;

create or replace function app.timesheet_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s jsonb := coalesce(app.setting('lembur'), '{}');
  normal_harian numeric := coalesce((s ->> 'jam_normal_harian')::numeric, 8);
  hari_kerja jsonb := coalesce(s -> 'hari_kerja', '[1,2,3,4,5]');
  tiers_kerja jsonb := coalesce(s -> 'pengali_hari_kerja', '[{"sampai":1,"pengali":1.5},{"sampai":null,"pengali":2}]');
  tiers_libur jsonb := coalesce(s -> 'pengali_hari_libur', '[{"sampai":8,"pengali":2},{"sampai":9,"pengali":3},{"sampai":null,"pengali":4}]');
  batas_harian numeric := coalesce((s ->> 'batas_lembur_harian')::numeric, 4);
  batas_mingguan numeric := coalesce((s ->> 'batas_lembur_mingguan')::numeric, 18);
  batas_kerja numeric := coalesce((s ->> 'batas_jam_kerja_harian')::numeric, 12);
  emp record;
  warn text[] := '{}';
  aktual numeric := 0;
  lembur_minggu numeric;
  role public.app_role := app.current_role();
  is_service boolean := auth.uid() is null;   -- service_role / migrasi
begin
  -- 1. Kunci: timesheet approved hanya boleh diubah Super Admin
  if tg_op = 'UPDATE' and old.approval_status = 'approved' and not (is_service or role = 'super_admin') then
    raise exception 'Timesheet % sudah di-approve dan terkunci. Hanya Super Admin yang dapat mengubah.', old.tanggal;
  end if;
  -- 2. Periode payroll yang sudah di-lock tidak bisa diubah (kecuali Super Admin)
  if exists (select 1 from public.payroll_periods p where p.status = 'locked'
             and new.tanggal between p.mulai and p.selesai)
     and not (is_service or role = 'super_admin') then
    raise exception 'Periode untuk tanggal % sudah dikunci.', new.tanggal;
  end if;
  -- 3. Hanya Admin yang boleh approve / reject
  if new.approval_status in ('approved', 'rejected')
     and (tg_op = 'INSERT' or new.approval_status is distinct from old.approval_status)
     and not (is_service or role in ('super_admin', 'admin')) then
    raise exception 'Hanya Admin yang dapat meng-approve timesheet.';
  end if;
  if new.approval_status = 'approved' and (tg_op = 'INSERT' or old.approval_status <> 'approved') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  -- Supervisor mengedit data yang ditolak → kembali ke antrean approval
  if tg_op = 'UPDATE' and old.approval_status = 'rejected' and new.approval_status = 'rejected' and role = 'supervisor' then
    new.approval_status := 'submitted';
  end if;
  if tg_op = 'UPDATE' then
    new.input_by := old.input_by;
  end if;

  select e.status, e.classification_id into emp from public.employees e where e.id = new.employee_id;
  if tg_op = 'INSERT' or new.classification_id is null then
    new.classification_id := emp.classification_id;   -- snapshot klasifikasi di tanggal kerja
  end if;

  -- 4. Tipe hari
  if exists (select 1 from public.holidays h where h.tanggal = new.tanggal)
     or not hari_kerja @> to_jsonb(extract(dow from new.tanggal)::int) then
    new.tipe_hari := 'libur';
  else
    new.tipe_hari := 'kerja';
  end if;

  -- 5. Hitung jam
  if new.status_kehadiran = 'hadir' and new.jam_masuk is not null and new.jam_keluar is not null then
    aktual := app.jam_kerja_bersih(new.jam_masuk, new.jam_keluar, coalesce(s -> 'jam_istirahat', '[{"mulai":"12:00","selesai":"13:00"}]'));
  elsif new.status_kehadiran = 'hadir' then
    warn := array_append(warn, 'Jam masuk/keluar tidak lengkap');
  end if;
  new.jam_aktual := aktual;
  if new.tipe_hari = 'kerja' then
    new.jam_normal := least(aktual, normal_harian);
    new.jam_lembur := greatest(aktual - normal_harian, 0);
    new.jam_konversi := app.apply_tiers(new.jam_lembur, tiers_kerja);
    if new.jam_lembur > batas_harian then
      warn := array_append(warn, format('Lembur %s jam melebihi batas %s jam/hari', new.jam_lembur, batas_harian));
    end if;
    select coalesce(sum(t.jam_lembur), 0) + new.jam_lembur into lembur_minggu
    from public.timesheets t
    where t.employee_id = new.employee_id and t.tipe_hari = 'kerja' and t.id <> new.id
      and date_trunc('week', t.tanggal) = date_trunc('week', new.tanggal);
    if lembur_minggu > batas_mingguan then
      warn := array_append(warn, format('Lembur minggu ini %s jam melebihi batas %s jam/minggu', lembur_minggu, batas_mingguan));
    end if;
  else
    new.jam_normal := 0;
    new.jam_lembur := aktual;
    new.jam_konversi := app.apply_tiers(aktual, tiers_libur);
  end if;
  if aktual > batas_kerja then
    warn := array_append(warn, format('Jam kerja %s jam melebihi %s jam/hari', aktual, batas_kerja));
  end if;
  if new.status_kehadiran = 'hadir' and aktual > 0 and emp.status in ('cuti', 'non_aktif', 'resign', 'selesai_kontrak') then
    warn := array_append(warn, format('Karyawan tercatat bekerja saat status %s', emp.status));
  end if;
  new.peringatan := warn;
  return new;
end $$;

create trigger trg_timesheet_before before insert or update on public.timesheets
  for each row execute function app.timesheet_before();

create or replace function app.timesheet_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.approval_status = 'approved' and not (auth.uid() is null or app.is_super_admin()) then
    raise exception 'Timesheet yang sudah di-approve tidak dapat dihapus.';
  end if;
  return old;
end $$;
create trigger trg_timesheet_delete before delete on public.timesheets
  for each row execute function app.timesheet_before_delete();

-- Payroll di periode terkunci tidak bisa diubah
create or replace function app.payroll_lock_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.period_id, old.period_id);
begin
  if exists (select 1 from public.payroll_periods where id = pid and status = 'locked') and auth.uid() is not null then
    raise exception 'Periode payroll sudah dikunci; snapshot tidak dapat diubah.';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_payroll_lock before insert or update or delete on public.payroll
  for each row execute function app.payroll_lock_guard();

-- Membuka kembali periode terkunci hanya oleh Super Admin
create or replace function app.period_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'locked' and new.status <> 'locked' and not (auth.uid() is null or app.is_super_admin()) then
    raise exception 'Hanya Super Admin yang dapat membuka kembali periode terkunci.';
  end if;
  if new.status = 'locked' and old.status <> 'locked' then
    new.locked_at := now();
    new.locked_by := auth.uid();
  end if;
  return new;
end $$;
create trigger trg_period_guard before update on public.payroll_periods
  for each row execute function app.period_guard();

-- Pembayaran invoice → update status invoice & catat kas masuk
create or replace function app.payment_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id); paid numeric; tot numeric; st public.invoice_status;
begin
  if tg_op = 'INSERT' then
    insert into public.cash_transactions (tanggal, arah, kategori, jumlah, keterangan, payment_id)
    select new.tanggal, 'masuk', 'pembayaran_invoice', new.jumlah, 'Pembayaran ' || i.nomor, new.id
    from public.invoices i where i.id = new.invoice_id;
  end if;
  select coalesce(sum(jumlah + pph23_dipotong), 0) into paid from public.payments where invoice_id = inv;
  select total_tagihan, status into tot, st from public.invoices where id = inv;
  update public.invoices set total_dibayar = paid,
    status = case when paid >= tot and tot > 0 then 'lunas'
                  when paid > 0 then 'dibayar_sebagian'
                  when st in ('lunas', 'dibayar_sebagian') then 'disetujui'
                  else st end
  where id = inv;
  return coalesce(new, old);
end $$;
create trigger trg_payment_sync after insert or delete on public.payments
  for each row execute function app.payment_sync();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','classifications','classification_rates','areas','teams','employees',
    'employee_compensation','employee_allowances','employee_salary_history','employee_certificates',
    'employee_documents','holidays','settings','payroll_periods','timesheets','payroll','cost_categories',
    'expenses','budgets','invoices','invoice_lines','payments','cash_transactions','audit_logs','login_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_admin());
create policy profiles_write on public.profiles for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

-- Master yang boleh dibaca semua user login
create policy classifications_read on public.classifications for select to authenticated using (true);
create policy classifications_write on public.classifications for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy areas_read on public.areas for select to authenticated using (true);
create policy areas_write on public.areas for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy teams_read on public.teams for select to authenticated using (true);
create policy teams_write on public.teams for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy holidays_read on public.holidays for select to authenticated using (true);
create policy holidays_write on public.holidays for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_write on public.settings for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy periods_read on public.payroll_periods for select to authenticated using (true);
create policy periods_write on public.payroll_periods for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Rate tagihan: rahasia komersial → hanya Admin
create policy rates_all on public.classification_rates for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- employees (non-gaji): admin semua, supervisor timnya, karyawan dirinya
create policy employees_select on public.employees for select to authenticated
  using (app.is_admin() or id = app.my_employee_id() or app.is_my_team_employee(id));
create policy employees_write on public.employees for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy certificates_select on public.employee_certificates for select to authenticated
  using (app.is_admin() or employee_id = app.my_employee_id() or app.is_my_team_employee(employee_id));
create policy certificates_write on public.employee_certificates for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Gaji: admin + karyawan ybs. Supervisor TIDAK punya policy → tidak bisa baca walau lewat API.
create policy comp_select on public.employee_compensation for select to authenticated
  using (app.is_admin() or employee_id = app.my_employee_id());
create policy comp_write on public.employee_compensation for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy allow_select on public.employee_allowances for select to authenticated
  using (app.is_admin() or employee_id = app.my_employee_id());
create policy allow_write on public.employee_allowances for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy salhist_select on public.employee_salary_history for select to authenticated
  using (app.is_admin() or employee_id = app.my_employee_id());
create policy salhist_write on public.employee_salary_history for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Dokumen: hanya admin
create policy documents_all on public.employee_documents for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Timesheet: jam saja (tanpa Rupiah)
create policy ts_select on public.timesheets for select to authenticated
  using (app.is_admin() or employee_id = app.my_employee_id() or app.is_my_team_employee(employee_id));
create policy ts_insert on public.timesheets for insert to authenticated
  with check (app.is_admin() or app.is_my_team_employee(employee_id));
create policy ts_update on public.timesheets for update to authenticated
  using (app.is_admin() or app.is_my_team_employee(employee_id))
  with check (app.is_admin() or app.is_my_team_employee(employee_id));
create policy ts_delete on public.timesheets for delete to authenticated
  using (app.is_admin() or (app.is_my_team_employee(employee_id) and approval_status <> 'approved'));

-- Payroll: admin semua; karyawan hanya slip miliknya pada periode yang sudah dikunci
create policy payroll_select on public.payroll for select to authenticated
  using (app.is_admin() or (employee_id = app.my_employee_id()
    and exists (select 1 from public.payroll_periods p where p.id = period_id and p.status = 'locked')));
create policy payroll_write on public.payroll for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Cost operasional: admin
create policy costcat_read on public.cost_categories for select to authenticated using (app.is_admin());
create policy costcat_write on public.cost_categories for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy expenses_all on public.expenses for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy budgets_all on public.budgets for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Keuangan: super admin + admin (bila diizinkan)
create policy invoices_all on public.invoices for all to authenticated
  using (app.can_view_finance()) with check (app.can_view_finance());
create policy invoice_lines_all on public.invoice_lines for all to authenticated
  using (app.can_view_finance()) with check (app.can_view_finance());
create policy payments_all on public.payments for all to authenticated
  using (app.can_view_finance()) with check (app.can_view_finance());
create policy cash_all on public.cash_transactions for all to authenticated
  using (app.can_view_finance()) with check (app.can_view_finance());

-- Log: super admin penuh, admin hanya lihat audit
create policy audit_select on public.audit_logs for select to authenticated using (app.is_admin());
create policy login_logs_select on public.login_logs for select to authenticated using (app.is_super_admin());

-- Anon tidak boleh akses apa pun di schema public
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
