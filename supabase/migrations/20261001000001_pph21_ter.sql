-- PPh 21 otomatis (TER PP 58/2023 & PMK 168/2023): kolom snapshot per slip.
alter table public.payroll
  add column if not exists bruto_pph21 numeric(14, 2) not null default 0,
  add column if not exists iuran_pegawai_pph21 numeric(14, 2) not null default 0,
  add column if not exists tunjangan_pph numeric(14, 2) not null default 0,
  add column if not exists pph21_metode text;

comment on column public.payroll.bruto_pph21 is 'Penghasilan bruto PPh 21 masa ini (gaji, tunjangan, lembur, tunjangan PPh, premi BPJS Kes/JKK/JKM dibayar perusahaan)';
comment on column public.payroll.pph21_metode is 'TER / Pasal 17 setahun / nihil — rincian di detail->pph21';

-- Rekap untuk bukti potong & perhitungan masa terakhir (RLS tabel payroll tetap berlaku)
create or replace function public.rekap_pph21_tahunan(p_tahun int)
returns table (employee_id uuid, bulan int, bruto numeric, iuran_pegawai numeric, pph21 numeric)
language sql stable as $$
  select p.employee_id, count(*)::int, sum(p.bruto_pph21), sum(p.iuran_pegawai_pph21), sum(p.pph21)
  from public.payroll p join public.payroll_periods pp on pp.id = p.period_id
  where extract(year from pp.selesai) = p_tahun
  group by p.employee_id
$$;
grant execute on function public.rekap_pph21_tahunan(int) to authenticated;
