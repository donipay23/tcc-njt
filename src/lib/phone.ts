/** Normalisasi No. HP Indonesia: hanya digit, awalan 62/+62 → 0. */
export function normalizePhone(v: string | null | undefined): string | null {
  if (!v) return null;
  let d = v.replace(/\D/g, "");
  if (d.startsWith("62")) d = "0" + d.slice(2);
  return d || null;
}
