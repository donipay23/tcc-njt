-- Mode offline input absensi: waktu input di HP untuk data yang disinkron belakangan.
alter table public.timesheets add column if not exists offline_dicatat_pada timestamptz;
comment on column public.timesheets.offline_dicatat_pada is 'Terisi bila timesheet diinput saat offline (waktu di perangkat) lalu disinkron ke server';
