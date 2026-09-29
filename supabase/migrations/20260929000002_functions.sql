-- =====================================================================
-- Fungsi agregasi (RPC). Semuanya SECURITY INVOKER sehingga RLS tetap
-- berlaku: supervisor hanya mendapat data timnya, dan fungsi yang memakai
-- rate/payroll/keuangan otomatis kosong bagi role yang tidak berhak.
-- =====================================================================

create or replace function public.hari_ini() returns date
language sql stable as $$ select (now() at time zone 'Asia/Makassar')::date $$;

-- Rekap jam per karyawan per periode
create or replace function public.rekap_timesheet(p_mulai date, p_selesai date, p_hanya_approved boolean default false)
returns table (
  employee_id uuid, hari_hadir int, hari_hadir_kerja int, hari_sakit int, hari_izin int, hari_alpa int,
  jam_aktual numeric, jam_normal numeric, jam_lembur numeric, jam_konversi numeric,
  jumlah_pending int, jumlah_peringatan int
)
language sql stable as $$
  select t.employee_id,
    count(*) filter (where t.status_kehadiran = 'hadir' and t.jam_aktual > 0)::int,
    count(*) filter (where t.status_kehadiran = 'hadir' and t.jam_aktual > 0 and t.tipe_hari = 'kerja')::int,
    count(*) filter (where t.status_kehadiran = 'sakit')::int,
    count(*) filter (where t.status_kehadiran = 'izin')::int,
    count(*) filter (where t.status_kehadiran = 'alpa')::int,
    coalesce(sum(t.jam_aktual), 0), coalesce(sum(t.jam_normal), 0),
    coalesce(sum(t.jam_lembur), 0), coalesce(sum(t.jam_konversi), 0),
    count(*) filter (where t.approval_status in ('submitted', 'draft'))::int,
    count(*) filter (where cardinality(t.peringatan) > 0)::int
  from public.timesheets t
  where t.tanggal between p_mulai and p_selesai
    and (not p_hanya_approved or t.approval_status = 'approved')
  group by t.employee_id
$$;

-- Tren jam normal vs lembur per hari / minggu / bulan
create or replace function public.tren_jam(p_mulai date, p_selesai date, p_satuan text default 'week')
returns table (bucket date, jam_aktual numeric, jam_normal numeric, jam_lembur numeric, jam_konversi numeric, orang int)
language sql stable as $$
  select date_trunc(p_satuan, t.tanggal)::date,
    sum(t.jam_aktual), sum(t.jam_normal), sum(t.jam_lembur), sum(t.jam_konversi),
    count(distinct t.employee_id)::int
  from public.timesheets t
  where t.tanggal between p_mulai and p_selesai
  group by 1 order by 1
$$;

-- Histogram manpower (manpower loading) per bulan
create or replace function public.manpower_bulanan(p_mulai date, p_selesai date)
returns table (bulan date, jumlah int)
language sql stable as $$
  select m::date, (
    select count(*)::int from public.employees e
    where e.tanggal_masuk <= (m + interval '1 month - 1 day')::date
      and (e.tanggal_keluar is null or e.tanggal_keluar >= m::date)
  )
  from generate_series(date_trunc('month', p_mulai), date_trunc('month', p_selesai), interval '1 month') m
$$;

create or replace function public.ringkasan_karyawan()
returns jsonb
language sql stable as $$
  with e as (select * from public.employees),
  b as (select date_trunc('month', public.hari_ini())::date as awal)
  select jsonb_build_object(
    'total', (select count(*) from e),
    'aktif', (select count(*) from e where status = 'aktif'),
    'baru_bulan_ini', (select count(*) from e, b where tanggal_masuk >= b.awal),
    'keluar_bulan_ini', (select count(*) from e, b where tanggal_keluar >= b.awal),
    'per_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from e group by 1) x),
    'per_klasifikasi', (select coalesce(jsonb_agg(jsonb_build_object('nama', coalesce(c.nama, '(belum diisi)'), 'jumlah', x.n) order by x.n desc), '[]')
       from (select classification_id, count(*) n from e where status = 'aktif' group by 1) x
       left join public.classifications c on c.id = x.classification_id),
    'per_area', (select coalesce(jsonb_agg(jsonb_build_object('nama', coalesce(a.nama, '(belum diisi)'), 'jumlah', x.n) order by x.n desc), '[]')
       from (select area_id, count(*) n from e where status = 'aktif' group by 1) x
       left join public.areas a on a.id = x.area_id)
  )
$$;

-- Timesheet approved + rate yang berlaku di tanggal kerja (dasar tagihan)
create or replace view public.v_timesheet_tagihan with (security_invoker = true) as
  select t.id, t.employee_id, t.tanggal, t.classification_id, t.jam_aktual,
         r.rate_per_jam, round(t.jam_aktual * r.rate_per_jam, 2) as nilai
  from public.timesheets t
  left join lateral (
    select cr.rate_per_jam from public.classification_rates cr
    where cr.classification_id = t.classification_id and cr.berlaku_mulai <= t.tanggal
    order by cr.berlaku_mulai desc limit 1
  ) r on true
  where t.approval_status = 'approved' and t.jam_aktual > 0;

-- Baris tagihan man-hour per karyawan/klasifikasi/rate
create or replace function public.tagihan_periode(p_mulai date, p_selesai date)
returns table (employee_id uuid, classification_id uuid, rate_per_jam numeric, jam_aktual numeric, jumlah numeric)
language sql stable as $$
  select v.employee_id, v.classification_id, v.rate_per_jam, sum(v.jam_aktual), round(sum(v.nilai))
  from public.v_timesheet_tagihan v
  where v.tanggal between p_mulai and p_selesai
  group by 1, 2, 3
$$;

-- Ringkasan keuangan per bulan (pendapatan akrual, biaya TK, biaya non-gaji)
create or replace function public.keuangan_bulanan(p_mulai date, p_selesai date)
returns table (bulan date, pendapatan numeric, biaya_tenaga_kerja numeric, biaya_non_gaji numeric, jam_aktual numeric)
language sql stable as $$
  with m as (
    select g::date as bulan from generate_series(date_trunc('month', p_mulai), date_trunc('month', p_selesai), interval '1 month') g
  )
  select m.bulan,
    coalesce((select sum(v.nilai) from public.v_timesheet_tagihan v where date_trunc('month', v.tanggal) = m.bulan), 0),
    coalesce((select sum(p.biaya_perusahaan) from public.payroll p join public.payroll_periods pp on pp.id = p.period_id
              where date_trunc('month', pp.selesai) = m.bulan), 0),
    coalesce((select sum(x.jumlah) from public.expenses x where x.status = 'dibayar' and date_trunc('month', x.tanggal) = m.bulan), 0),
    coalesce((select sum(v.jam_aktual) from public.v_timesheet_tagihan v where date_trunc('month', v.tanggal) = m.bulan), 0)
  from m order by m.bulan
$$;

-- Margin per klasifikasi: (rate × jam aktual) − biaya tenaga kerja klasifikasi tsb.
create or replace function public.profit_klasifikasi(p_mulai date, p_selesai date)
returns table (classification_id uuid, nama text, jam_aktual numeric, jam_konversi numeric, pendapatan numeric,
               gaji_tunjangan numeric, upah_lembur numeric, bpjs numeric, biaya_tenaga_kerja numeric)
language sql stable as $$
  with rev as (
    select v.classification_id, sum(v.jam_aktual) jam, sum(v.nilai) nilai
    from public.v_timesheet_tagihan v where v.tanggal between p_mulai and p_selesai group by 1
  ), cost as (
    select p.classification_id, sum(p.jam_konversi) konv,
      sum(p.gaji_pokok + p.tunjangan_tetap + p.tunjangan_tidak_tetap) gt, sum(p.upah_lembur) ul,
      sum(p.bpjs_perusahaan_total) bp, sum(p.biaya_perusahaan) total
    from public.payroll p join public.payroll_periods pp on pp.id = p.period_id
    where pp.mulai >= p_mulai and pp.selesai <= p_selesai group by 1
  )
  select c.id, c.nama, coalesce(rev.jam, 0), coalesce(cost.konv, 0), coalesce(rev.nilai, 0),
         coalesce(cost.gt, 0), coalesce(cost.ul, 0), coalesce(cost.bp, 0), coalesce(cost.total, 0)
  from public.classifications c
  left join rev on rev.classification_id = c.id
  left join cost on cost.classification_id = c.id
  where rev.classification_id is not null or cost.classification_id is not null
  order by 5 desc
$$;

-- Karyawan menandai password awal sudah diganti
create or replace function public.tandai_password_diganti()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

revoke execute on all functions in schema public from anon;
grant execute on function public.rekap_timesheet, public.tren_jam, public.manpower_bulanan, public.ringkasan_karyawan,
  public.tagihan_periode, public.keuangan_bulanan, public.profit_klasifikasi, public.tandai_password_diganti,
  public.hari_ini to authenticated;
grant select on public.v_timesheet_tagihan to authenticated;
