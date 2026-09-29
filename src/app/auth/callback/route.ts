import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_AT_COOKIE, SESSION_HOURS } from "@/lib/session-const";

/** Link reset password dari email → tukar kode menjadi sesi → halaman ganti password. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/ganti-password";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/ganti-password";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(new URL(safeNext, req.url));
      res.cookies.set(LOGIN_AT_COOKIE, String(Date.now()), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: SESSION_HOURS * 3600 });
      return res;
    }
  }
  return NextResponse.redirect(new URL("/login?pesan=Link+tidak+valid+atau+kedaluwarsa", req.url));
}
