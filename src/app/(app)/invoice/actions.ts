"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { hitungPajakInvoice } from "@/lib/calc/invoice";
import { hariIni, tambahHari } from "@/lib/format";

export async function buatInvoice(form: FormData) {
  await requireFinance();
  const supabase = await createClient();
  const settings = await getSettings();
  let mulai = String(form.get("mulai") ?? "");
  let selesai = String(form.get("selesai") ?? "");
  const periodId = String(form.get("period_id") ?? "") || null;
  if (periodId) {
    const { data: p } = await supabase.from("payroll_periods").select("mulai, selesai").eq("id", periodId).single();
    if (p) ({ mulai, selesai } = p);
  }
  if (!mulai || !selesai) redirect("/invoice?err=Pilih+periode+atau+rentang+tanggal");

  const { data: overlap } = await supabase.from("invoices").select("nomor").lte("periode_mulai", selesai).gte("periode_selesai", mulai).limit(1);
  if (overlap?.length) redirect(`/invoice?err=${encodeURIComponent(`Rentang tumpang tindih dengan invoice ${overlap[0].nomor} (cegah tagihan ganda)`)}`);

  const lines = await fetchAll((a, b) => supabase.rpc("tagihan_periode", { p_mulai: mulai, p_selesai: selesai }).range(a, b));
  const tanpaRate = (lines as any[]).filter((l) => l.rate_per_jam == null);
  if (tanpaRate.length) {
    const { data: cls } = await supabase.from("classifications").select("id, nama").in("id", [...new Set(tanpaRate.map((l) => l.classification_id).filter(Boolean))]);
    redirect(`/invoice?err=${encodeURIComponent(`Ada ${tanpaRate.length} baris tanpa rate yang berlaku (klasifikasi: ${(cls ?? []).map((c) => c.nama).join(", ") || "belum diisi"}). Lengkapi rate di menu Klasifikasi.`)}`);
  }
  if (!lines.length) redirect("/invoice?err=Tidak+ada+timesheet+approved+pada+rentang+ini");

  const subtotal = (lines as any[]).reduce((a, l) => a + Number(l.jumlah), 0);
  const pajak = hitungPajakInvoice(subtotal, settings.pajak);
  const tgl = String(form.get("tanggal") || hariIni());
  const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).gte("tanggal", `${tgl.slice(0, 4)}-01-01`);
  const nomor = String(form.get("nomor") || `INV/${tgl.slice(0, 4)}/${tgl.slice(5, 7)}/${String((count ?? 0) + 1).padStart(3, "0")}`);

  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      nomor,
      period_id: periodId,
      periode_mulai: mulai,
      periode_selesai: selesai,
      tanggal: tgl,
      jatuh_tempo: tambahHari(tgl, settings.pajak.termin_hari),
      subtotal: pajak.subtotal,
      dpp_ppn: pajak.dpp_ppn,
      ppn: pajak.ppn,
      pph23: pajak.pph23,
      total_tagihan: pajak.total_tagihan,
      pajak_snapshot: settings.pajak,
    })
    .select("id")
    .single();
  if (error || !inv) redirect(`/invoice?err=${encodeURIComponent(error?.message ?? "Gagal")}`);
  const payload = (lines as any[]).map((l) => ({ invoice_id: inv!.id, employee_id: l.employee_id, classification_id: l.classification_id, rate_per_jam: l.rate_per_jam, jam_aktual: l.jam_aktual, jumlah: l.jumlah }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error: e2 } = await supabase.from("invoice_lines").insert(payload.slice(i, i + 500));
    if (e2) {
      await supabase.from("invoices").delete().eq("id", inv!.id);
      redirect(`/invoice?err=${encodeURIComponent(e2.message)}`);
    }
  }
  revalidatePath("/invoice");
  redirect(`/invoice/${inv!.id}?ok=Draft+invoice+dibuat`);
}

export async function ubahStatusInvoice(form: FormData) {
  await requireFinance();
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "terkirim") {
    const tk = String(form.get("tanggal_kirim") || hariIni());
    patch.tanggal_kirim = tk;
    const { data: inv } = await supabase.from("invoices").select("pajak_snapshot").eq("id", id).single();
    patch.jatuh_tempo = tambahHari(tk, Number((inv?.pajak_snapshot as any)?.termin_hari ?? 30));
  }
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  redirect(`/invoice/${id}?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Status diperbarui")}`);
}

export async function tambahPembayaran(form: FormData) {
  await requireFinance();
  const id = String(form.get("invoice_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    invoice_id: id,
    tanggal: String(form.get("tanggal")),
    jumlah: Number(form.get("jumlah")) || 0,
    pph23_dipotong: Number(form.get("pph23_dipotong")) || 0,
    keterangan: String(form.get("keterangan") ?? "") || null,
  });
  redirect(`/invoice/${id}?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Pembayaran dicatat & masuk arus kas")}`);
}

export async function hapusPembayaran(form: FormData) {
  await requireFinance();
  const supabase = await createClient();
  await supabase.from("payments").delete().eq("id", String(form.get("id")));
  revalidatePath(`/invoice/${form.get("invoice_id")}`);
}

export async function hapusInvoice(form: FormData) {
  await requireFinance();
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("status").eq("id", String(form.get("id"))).single();
  if (data?.status !== "draft") redirect(`/invoice/${form.get("id")}?err=Hanya+draft+yang+dapat+dihapus`);
  await supabase.from("invoices").delete().eq("id", String(form.get("id")));
  redirect("/invoice?ok=Draft+invoice+dihapus");
}
