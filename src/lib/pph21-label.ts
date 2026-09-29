/** Label PPh 21 untuk slip & tabel payroll (dipakai di server maupun client). */
export function labelPph21(p: { pph21: number | string; detail?: { pph21?: { metode?: string; tarif_ter?: number | null; status_ptkp?: string } | null } | null }): string {
  const d = p.detail?.pph21;
  const ptkp = d?.status_ptkp ? ` ${d.status_ptkp}` : "";
  if (Number(p.pph21) < 0) return `PPh 21 lebih potong dikembalikan${ptkp}`;
  if (d?.metode === "TER" && d.tarif_ter != null) return `PPh 21 (TER ${(d.tarif_ter * 100).toLocaleString("id-ID")}%${ptkp})`;
  if (d?.metode === "Pasal 17 setahun") return `PPh 21 (masa terakhir, Pasal 17${ptkp})`;
  return "PPh 21";
}

