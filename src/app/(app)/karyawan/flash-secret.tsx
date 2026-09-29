import { readSecretFlash } from "@/lib/flash-cookie";
import { hapusFlash } from "./actions";

/** Menampilkan password awal / hasil reset sekali saja. */
export async function FlashSecret() {
  const text = await readSecretFlash();
  if (!text) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Catat & serahkan ke karyawan — informasi ini hanya tampil sekali:</p>
      <p className="mt-1 break-all font-mono">{text}</p>
      <form action={hapusFlash} className="mt-2">
        <button className="btn-secondary btn-sm">Sudah dicatat, sembunyikan</button>
      </form>
    </div>
  );
}
