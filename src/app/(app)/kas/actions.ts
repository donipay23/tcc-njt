"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function tambahKas(form: FormData) {
  await requireFinance();
  const supabase = await createClient();
  const kategori = String(form.get("kategori"));
  const masuk = ["modal", "pinjaman"].includes(kategori) || (kategori === "lainnya" && form.get("arah") === "masuk");
  const { error } = await supabase.from("cash_transactions").insert({
    tanggal: String(form.get("tanggal")),
    arah: masuk ? "masuk" : "keluar",
    kategori,
    jumlah: Number(form.get("jumlah")) || 0,
    keterangan: String(form.get("keterangan") ?? "") || null,
    period_id: String(form.get("period_id") ?? "") || null,
  });
  redirect(`/kas?${error ? "err" : "ok"}=${encodeURIComponent(error?.message ?? "Transaksi kas dicatat")}`);
}

export async function hapusKas(form: FormData) {
  await requireFinance();
  const supabase = await createClient();
  await supabase.from("cash_transactions").delete().eq("id", String(form.get("id"))).is("payment_id", null);
  revalidatePath("/kas");
}
