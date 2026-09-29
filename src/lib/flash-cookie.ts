import "server-only";
import { cookies } from "next/headers";

const NAME = "mps_flash_secret";

/** Menyimpan info rahasia (mis. password awal) sekali tampil, 2 menit, httpOnly. */
export async function setSecretFlash(text: string) {
  (await cookies()).set(NAME, text, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 120 });
}

export async function readSecretFlash(): Promise<string | null> {
  return (await cookies()).get(NAME)?.value ?? null;
}
