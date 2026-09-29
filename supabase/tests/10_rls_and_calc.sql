-- Uji hak akses (RLS) & perhitungan jam di database.
-- Pengguna: SA = super admin, AD = admin, SP = supervisor, KR = karyawan (E1)
\set SA '''00000000-0000-0000-0000-00000000000a'''
\set AD '''00000000-0000-0000-0000-00000000000b'''
\set SP '''00000000-0000-0000-0000-00000000000c'''
\set KR '''00000000-0000-0000-0000-00000000000d'''

insert into auth.users (id, email) values (:SA, 'sa@x.id'), (:AD, 'ad@x.id'), (:SP, 'sp@x.id'), (:KR, 'kr@x.id');
insert into public.profiles (id, role, full_name, email) values
  (:SA, 'super_admin', 'Super', 'sa@x.id'), (:AD, 'admin', 'Admin', 'ad@x.id'),
  (:SP, 'supervisor', 'Spv', 'sp@x.id'), (:KR, 'karyawan', 'Budi', 'kr@x.id');
insert into public.teams (id, nama, supervisor_id) values
  ('10000000-0000-0000-0000-000000000001', 'Regu A', :SP), ('10000000-0000-0000-0000-000000000002', 'Regu B', null);
insert into public.employees (id, nama, tanggal_masuk, team_id, classification_id) values
  ('20000000-0000-0000-0000-000000000001', 'Budi', '2026-01-01', '10000000-0000-0000-0000-000000000001', (select id from classifications where kode = 'WLD6G')),
  ('20000000-0000-0000-0000-000000000002', 'Andi', '2026-01-01', '10000000-0000-0000-0000-000000000002', (select id from classifications where kode = 'HLP'));
update public.profiles set employee_id = '20000000-0000-0000-0000-000000000001' where id = :KR;
insert into public.employee_compensation (employee_id, gaji_pokok) values
  ('20000000-0000-0000-0000-000000000001', 5000000), ('20000000-0000-0000-0000-000000000002', 4000000);
insert into public.classification_rates (classification_id, rate_per_jam, berlaku_mulai)
  select id, 100000, '2026-01-01' from classifications where kode = 'WLD6G';

set role authenticated;

-- ===== SUPERVISOR =====
select set_config('request.jwt.claim.sub', :SP, false);
insert into public.timesheets (employee_id, tanggal, jam_masuk, jam_keluar) values
  ('20000000-0000-0000-0000-000000000001', '2026-09-30', '07:00', '19:00'),
  ('20000000-0000-0000-0000-000000000001', '2026-10-03', '07:00', '18:00'),
  ('20000000-0000-0000-0000-000000000001', '2026-08-17', '07:00', '16:00');
do $$
declare r record;
begin
  select * into r from public.timesheets where tanggal = '2026-09-30';
  assert r.jam_aktual = 11 and r.jam_normal = 8 and r.jam_lembur = 3 and r.jam_konversi = 5.5, 'Rabu salah: ' || row_to_json(r);
  select * into r from public.timesheets where tanggal = '2026-10-03';
  assert r.tipe_hari = 'libur' and r.jam_aktual = 10 and r.jam_konversi = 23, 'Sabtu salah: ' || row_to_json(r);
  select * into r from public.timesheets where tanggal = '2026-08-17';
  assert r.tipe_hari = 'libur' and r.jam_konversi = 16, 'Libur nasional salah: ' || row_to_json(r);
  assert r.classification_id is not null, 'Snapshot klasifikasi kosong';
  assert (select count(*) from public.employees) = 1, 'Supervisor hanya boleh melihat timnya';
  assert (select count(*) from public.employee_compensation) = 0, 'Supervisor TIDAK boleh melihat gaji';
  assert (select count(*) from public.employee_allowances) = 0, 'Supervisor tidak boleh melihat tunjangan';
  assert (select count(*) from public.payroll) = 0, 'Supervisor tidak boleh melihat payroll';
  assert (select count(*) from public.classification_rates) = 0, 'Supervisor tidak boleh melihat rate';
  assert (select count(*) from public.tagihan_periode('2026-01-01', '2026-12-31')) = 0, 'Supervisor tidak boleh melihat tagihan';
  assert (select count(*) from public.rekap_timesheet('2026-08-01', '2026-10-31')) = 1, 'Rekap supervisor';
  begin
    insert into public.timesheets (employee_id, tanggal, jam_masuk, jam_keluar)
      values ('20000000-0000-0000-0000-000000000002', '2026-09-30', '07:00', '16:00');
    raise exception 'GAGAL: supervisor bisa input karyawan tim lain';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.timesheets set approval_status = 'approved' where tanggal = '2026-09-30';
    raise exception 'GAGAL: supervisor bisa approve';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
  end;
  begin
    update public.employee_compensation set gaji_pokok = 1;
    if found then raise exception 'GAGAL: supervisor bisa ubah gaji'; end if;
  end;
end $$;

-- ===== ADMIN =====
select set_config('request.jwt.claim.sub', :AD, false);
update public.timesheets set approval_status = 'approved';
do $$
begin
  assert (select count(*) from public.timesheets where approval_status = 'approved') = 3, 'Admin approve';
  assert (select count(*) from public.employee_compensation) = 2, 'Admin melihat semua gaji';
  assert (select sum(jumlah) from public.tagihan_periode('2026-09-01', '2026-10-31')) = 2100000, 'Tagihan = 21 jam × 100.000';
end $$;

-- Supervisor tidak bisa ubah timesheet yang sudah approved
select set_config('request.jwt.claim.sub', :SP, false);
do $$
begin
  update public.timesheets set jam_keluar = '20:00' where tanggal = '2026-09-30';
  raise exception 'GAGAL: timesheet approved bisa diubah';
exception when raise_exception then
  if sqlerrm like 'GAGAL%' then raise; end if;
end $$;

-- Admin (bukan super admin) juga tidak bisa ubah timesheet approved
select set_config('request.jwt.claim.sub', :AD, false);
do $$
begin
  update public.timesheets set jam_keluar = '20:00' where tanggal = '2026-09-30';
  raise exception 'GAGAL: admin bisa ubah timesheet approved';
exception when raise_exception then
  if sqlerrm like 'GAGAL%' then raise; end if;
end $$;

-- Super admin bisa, dan tercatat di audit log
select set_config('request.jwt.claim.sub', :SA, false);
update public.timesheets set jam_keluar = '20:00' where tanggal = '2026-09-30';
do $$
begin
  assert (select jam_konversi from public.timesheets where tanggal = '2026-09-30') = 7.5, 'Hitung ulang 12 jam = 1,5+2+2+2';
  assert exists (select 1 from public.audit_logs where table_name = 'timesheets' and action = 'UPDATE'
                 and changed_by = '00000000-0000-0000-0000-00000000000a'), 'Audit log tercatat';
end $$;

-- Periode payroll & slip
select set_config('request.jwt.claim.sub', :AD, false);
insert into public.payroll_periods (id, nama, mulai, selesai) values ('30000000-0000-0000-0000-000000000001', 'Sep 2026', '2026-09-01', '2026-09-30');
insert into public.payroll (period_id, employee_id, basis_gaji, gaji_pokok, take_home_pay)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'bulanan', 5000000, 5000000),
         ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'bulanan', 4000000, 4000000);

-- ===== KARYAWAN =====
select set_config('request.jwt.claim.sub', :KR, false);
do $$
begin
  assert (select count(*) from public.employees) = 1, 'Karyawan hanya melihat dirinya';
  assert (select count(*) from public.employee_compensation) = 1, 'Karyawan melihat gaji sendiri';
  assert (select count(*) from public.payroll) = 0, 'Slip belum terlihat sebelum periode dikunci';
  assert (select count(*) from public.invoices) = 0, 'Karyawan tidak melihat invoice';
  assert (select count(*) from public.audit_logs) = 0, 'Karyawan tidak melihat audit log';
  begin
    insert into public.timesheets (employee_id, tanggal) values ('20000000-0000-0000-0000-000000000001', '2026-09-01');
    raise exception 'GAGAL: karyawan bisa input timesheet';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', :AD, false);
update public.payroll_periods set status = 'locked';
do $$
begin
  begin
    update public.payroll set pph21 = 1;
    raise exception 'GAGAL: payroll terkunci bisa diubah';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
  end;
  begin
    update public.payroll_periods set status = 'open';
    raise exception 'GAGAL: admin bisa membuka periode';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', :KR, false);
do $$
begin
  assert (select count(*) from public.payroll) = 1, 'Karyawan melihat 1 slip miliknya setelah dikunci';
end $$;

-- Akses keuangan admin dapat dimatikan
reset role;
update public.settings set value = 'false' where key = 'admin_akses_keuangan';
set role authenticated;
select set_config('request.jwt.claim.sub', :AD, false);
do $$
begin
  assert not app.can_view_finance(), 'Admin tanpa akses keuangan';
end $$;
select set_config('request.jwt.claim.sub', :SA, false);
do $$
begin
  assert app.can_view_finance(), 'Super admin selalu punya akses keuangan';
end $$;
reset role;
