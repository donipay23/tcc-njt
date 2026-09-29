-- Bucket privat untuk dokumen karyawan & bukti pengeluaran. Hanya Admin.
insert into storage.buckets (id, name, public) values ('dokumen', 'dokumen', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('bukti', 'bukti', false) on conflict (id) do nothing;

create policy "dokumen_admin" on storage.objects for all to authenticated
  using (bucket_id in ('dokumen', 'bukti') and app.is_admin())
  with check (bucket_id in ('dokumen', 'bukti') and app.is_admin());
