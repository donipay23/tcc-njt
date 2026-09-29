import { notFound } from "next/navigation";
import { getPerusahaan, requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getMasters } from "@/lib/masters";
import { angka, hariIni, persen, rupiah, tanggal } from "@/lib/format";
import { STATUS_INVOICE } from "@/lib/types";
import { Badge, Card, DataTable, Field, Flash, Info, PageHeader, toneStatus } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ExportButtons } from "@/components/export-buttons";
import { hapusInvoice, hapusPembayaran, tambahPembayaran, ubahStatusInvoice } from "../actions";

export const metadata = { title: "Detail invoice" };

const NEXT: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: "terkirim", label: "Tandai terkirim" }],
  terkirim: [{ status: "disetujui", label: "Disetujui klien" }, { status: "draft", label: "Kembalikan ke draft" }],
  disetujui: [],
  dibayar_sebagian: [],
  lunas: [],
};

export default async function InvoiceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireFinance();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const m = await getMasters();
  const p = await getPerusahaan();
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) notFound();
  const [lines, pays, emps] = await Promise.all([
    fetchAll((a, b) => supabase.from("invoice_lines").select("*").eq("invoice_id", id).range(a, b)),
    supabase.from("payments").select("*").eq("invoice_id", id).order("tanggal"),
    fetchAll((a, b) => supabase.from("employees").select("id, nik, nama").range(a, b)),
  ]);
  const eMap = new Map((emps as any[]).map((e) => [e.id, e]));
  const perKaryawan = (lines as any[])
    .map((l) => ({ ...l, nama: eMap.get(l.employee_id)?.nama ?? "-", nik: eMap.get(l.employee_id)?.nik ?? "-", klasifikasi: m.cName.get(l.classification_id) ?? "-" }))
    .sort((a, b) => a.klasifikasi.localeCompare(b.klasifikasi) || a.nama.localeCompare(b.nama));
  const perKlas = new Map<string, { klasifikasi: string; rate_per_jam: number; orang: Set<string>; jam_aktual: number; jumlah: number }>();
  for (const l of perKaryawan) {
    const k = `${l.klasifikasi}|${l.rate_per_jam}`;
    const r = perKlas.get(k) ?? { klasifikasi: l.klasifikasi, rate_per_jam: Number(l.rate_per_jam), orang: new Set(), jam_aktual: 0, jumlah: 0 };
    r.orang.add(l.employee_id);
    r.jam_aktual += Number(l.jam_aktual);
    r.jumlah += Number(l.jumlah);
    perKlas.set(k, r);
  }
  const ringkas = [...perKlas.entries()].map(([k, r]) => ({ key: k, ...r, orang: r.orang.size }));
  const pj = inv.pajak_snapshot ?? {};
  const sisa = Number(inv.total_tagihan) - Number(inv.total_dibayar);

  const exportRingkas = ringkas.map((r) => ({ ...r }));
  const totalRow = { klasifikasi: "SUBTOTAL", jumlah: Number(inv.subtotal) };
  const pajakRows = [
    { klasifikasi: `DPP PPN (${angka(Number(pj.ppn_dpp_faktor ?? 1) * 100)}%)`, jumlah: Number(inv.dpp_ppn) },
    { klasifikasi: `PPN ${persen(Number(pj.ppn_tarif ?? 0) * 100)}`, jumlah: Number(inv.ppn) },
    { klasifikasi: "TOTAL TAGIHAN", jumlah: Number(inv.total_tagihan) },
    { klasifikasi: `PPh 23 ${persen(Number(pj.pph23_tarif ?? 0) * 100)} (dipotong klien)`, jumlah: -Number(inv.pph23) },
    { klasifikasi: "Estimasi diterima", jumlah: Number(inv.total_tagihan) - Number(inv.pph23) },
  ];

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.nomor}`}
        subtitle={<>{p.klien}{p.no_kontrak ? ` · Kontrak ${p.no_kontrak}` : ""} · <Badge tone={toneStatus(inv.status)}>{STATUS_INVOICE[inv.status]}</Badge></>}
        actions={
          <ExportButtons
            filename={`invoice-${inv.nomor.replace(/\W+/g, "-")}`}
            judul={`Invoice ${inv.nomor} – ${p.nama}`}
            subjudul={`Kepada ${p.klien} · Periode ${tanggal(inv.periode_mulai)} – ${tanggal(inv.periode_selesai)} · Tgl ${tanggal(inv.tanggal)} · Jatuh tempo ${tanggal(inv.jatuh_tempo)}`}
            cols={[
              { key: "klasifikasi", label: "Klasifikasi" },
              { key: "orang", label: "Orang", type: "angka" },
              { key: "jam_aktual", label: "Jam aktual", type: "angka" },
              { key: "rate_per_jam", label: "Rate / jam", type: "rupiah" },
              { key: "jumlah", label: "Jumlah", type: "rupiah" },
            ]}
            rows={[...exportRingkas, totalRow, ...pajakRows]}
            extraSheets={[{
              name: "Lampiran per karyawan",
              cols: [{ key: "nik", label: "NIK" }, { key: "nama", label: "Nama" }, { key: "klasifikasi", label: "Klasifikasi" }, { key: "jam_aktual", label: "Jam aktual", type: "angka" }, { key: "rate_per_jam", label: "Rate", type: "rupiah" }, { key: "jumlah", label: "Jumlah", type: "rupiah" }],
              rows: perKaryawan,
            }]}
          />
        }
      />
      <Flash sp={sp} />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Ringkasan" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Info label="Periode kerja" value={`${tanggal(inv.periode_mulai)} – ${tanggal(inv.periode_selesai)}`} />
            <Info label="Tanggal invoice" value={tanggal(inv.tanggal)} />
            <Info label="Tanggal kirim" value={tanggal(inv.tanggal_kirim)} />
            <Info label="Jatuh tempo" value={<span className={inv.jatuh_tempo < hariIni() && sisa > 0 && inv.status !== "draft" ? "font-semibold text-red-700" : ""}>{tanggal(inv.jatuh_tempo)}</span>} />
          </dl>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {[
                ["Subtotal (Σ jam aktual × rate)", inv.subtotal],
                [`DPP PPN (${angka(Number(pj.ppn_dpp_faktor ?? 1) * 100)}% × subtotal)`, inv.dpp_ppn],
                [`PPN ${persen(Number(pj.ppn_tarif ?? 0) * 100)}`, inv.ppn],
                ["Total tagihan", inv.total_tagihan],
                [`PPh 23 ${persen(Number(pj.pph23_tarif ?? 0) * 100)} dipotong klien`, -Number(inv.pph23)],
                ["Sudah dibayar (termasuk bukti potong PPh 23)", inv.total_dibayar],
                ["Sisa piutang", sisa],
              ].map(([k, v], i) => (
                <tr key={i} className={`border-t border-gray-100 ${i === 3 || i === 6 ? "font-semibold" : ""}`}>
                  <td className="py-1.5">{k}</td>
                  <td className="py-1.5 text-right tabular-nums">{rupiah(v as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Status">
          <div className="space-y-2">
            {NEXT[inv.status]?.map((n) => (
              <form key={n.status} action={ubahStatusInvoice} className="flex gap-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value={n.status} />
                {n.status === "terkirim" && <input type="date" name="tanggal_kirim" defaultValue={hariIni()} className="input" />}
                <SubmitButton className="btn-secondary">{n.label}</SubmitButton>
              </form>
            ))}
            <p className="text-xs text-gray-500">Status “Dibayar sebagian” dan “Lunas” diperbarui otomatis dari pencatatan pembayaran.</p>
            {inv.status === "draft" && (
              <form action={hapusInvoice}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton className="btn-danger btn-sm" confirm="Hapus draft invoice ini?">Hapus draft</SubmitButton>
              </form>
            )}
          </div>
        </Card>
      </div>

      {inv.status !== "draft" && (
        <Card title="Pembayaran" className="mb-4" bodyClass="">
          <DataTable
            rows={(pays.data as any[]) ?? []}
            rowKey={(r) => r.id}
            empty="Belum ada pembayaran."
            cols={[
              { key: "tanggal", label: "Tanggal", primary: true, render: (r) => tanggal(r.tanggal) },
              { key: "jumlah", label: "Diterima di bank", num: true, render: (r) => rupiah(r.jumlah) },
              { key: "pph23_dipotong", label: "PPh 23 dipotong", num: true, render: (r) => rupiah(r.pph23_dipotong) },
              { key: "keterangan", label: "Keterangan" },
              {
                key: "aksi",
                label: "",
                render: (r) => (
                  <form action={hapusPembayaran}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="invoice_id" value={id} />
                    <SubmitButton className="btn-secondary btn-sm" confirm="Hapus pembayaran? Transaksi kas terkait ikut terhapus.">Hapus</SubmitButton>
                  </form>
                ),
              },
            ]}
          />
          {sisa > 0 && (
            <form action={tambahPembayaran} className="grid grid-cols-2 items-end gap-3 border-t border-gray-100 p-4 md:grid-cols-5">
              <input type="hidden" name="invoice_id" value={id} />
              <Field label="Tanggal"><input type="date" name="tanggal" defaultValue={hariIni()} required className="input" /></Field>
              <Field label="Diterima (Rp)"><input type="number" name="jumlah" defaultValue={Math.max(0, sisa - Number(inv.pph23))} required className="input" /></Field>
              <Field label="PPh 23 dipotong (Rp)"><input type="number" name="pph23_dipotong" defaultValue={Number(inv.total_dibayar) ? 0 : Number(inv.pph23)} className="input" /></Field>
              <Field label="Keterangan"><input name="keterangan" className="input" /></Field>
              <SubmitButton>Catat pembayaran</SubmitButton>
            </form>
          )}
        </Card>
      )}

      <Card title="Rekap per klasifikasi" className="mb-4" bodyClass="">
        <DataTable
          rows={ringkas}
          rowKey={(r) => r.key}
          cols={[
            { key: "klasifikasi", label: "Klasifikasi", primary: true },
            { key: "orang", label: "Orang", num: true },
            { key: "jam_aktual", label: "Jam aktual", num: true, render: (r) => angka(r.jam_aktual) },
            { key: "rate_per_jam", label: "Rate / jam", num: true, render: (r) => rupiah(r.rate_per_jam) },
            { key: "jumlah", label: "Jumlah", num: true, render: (r) => rupiah(r.jumlah) },
          ]}
        />
      </Card>
      <Card title={`Lampiran per karyawan (${perKaryawan.length} baris)`} bodyClass="">
        <DataTable
          rows={perKaryawan}
          rowKey={(r) => r.id}
          cols={[
            { key: "nama", label: "Karyawan", primary: true, render: (r) => <>{r.nama}<div className="text-xs text-gray-500">{r.nik}</div></> },
            { key: "klasifikasi", label: "Klasifikasi" },
            { key: "jam_aktual", label: "Jam aktual", num: true, render: (r) => angka(r.jam_aktual) },
            { key: "rate_per_jam", label: "Rate", num: true, render: (r) => rupiah(r.rate_per_jam) },
            { key: "jumlah", label: "Jumlah", num: true, render: (r) => rupiah(r.jumlah) },
          ]}
        />
      </Card>
    </>
  );
}
