/**
 * Supabase/PostgREST membatasi 1.000 baris per request. Helper ini mengambil semua
 * halaman untuk query yang bisa melebihi batas (≥ 1.000 karyawan, timesheet sebulan, dst.).
 */
export async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
