"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const back = (bulan: string, msg: string, key: "ok" | "err" = "ok") => redirect(`/biaya?bulan=${bulan}&${key}=${encodeURIComponent(msg)}`);

export async function tambahBiaya(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const tgl = String(form.get("tanggal"));
  const bulan = tgl.slice(0, 7);
  let bukti_path: string | null = null;
  const file = form.get("bukti");
  if (file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) back(bulan, "Ukuran bukti maksimal 5 MB", "err");
    bukti_path = `${bulan}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from("bukti").upload(bukti_path, file, { contentType: file.type });
    if (error) back(bulan, `Upload bukti gagal: ${error.message}`, "err");
  }
  const { error } = await supabase.from("expenses").insert({
    tanggal: tgl,
    category_id: String(form.get("category_id")),
    deskripsi: String(form.get("deskripsi")),
    jumlah: Number(form.get("jumlah")) || 0,
    vendor: String(form.get("vendor") ?? "") || null,
    metode_bayar: String(form.get("metode_bayar") ?? "") || null,
    status: String(form.get("status") ?? "dibayar"),
    bukti_path,
  });
  if (error) back(bulan, error.message, "err");
  revalidatePath("/biaya");
  back(bulan, "Biaya tersimpan");
}

export async function ubahStatusBiaya(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  await supabase.from("expenses").update({ status: String(form.get("status")) }).eq("id", String(form.get("id")));
  revalidatePath("/biaya");
}

export async function hapusBiaya(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const { data } = await supabase.from("expenses").select("bukti_path").eq("id", String(form.get("id"))).single();
  if (data?.bukti_path) await supabase.storage.from("bukti").remove([data.bukti_path]);
  await supabase.from("expenses").delete().eq("id", String(form.get("id")));
  revalidatePath("/biaya");
}

export async function tambahKategori(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const { error } = await supabase.from("cost_categories").insert({ nama: String(form.get("nama")).trim() });
  back(String(form.get("bulan")), error ? error.message : "Kategori ditambahkan", error ? "err" : "ok");
}

export async function simpanBudget(form: FormData) {
  await requireRole("super_admin", "admin");
  const supabase = await createClient();
  const bulan = String(form.get("bulan"));
  const rows = form
    .getAll("category_id")
    .map((cid, i) => ({ category_id: String(cid), bulan: `${bulan}-01`, jumlah: Number(form.getAll("jumlah")[i]) || 0 }));
  const { error } = await supabase.from("budgets").upsert(rows, { onConflict: "category_id,bulan" });
  back(bulan, error ? error.message : "Budget tersimpan", error ? "err" : "ok");
}
