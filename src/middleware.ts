import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_AT_COOKIE, SESSION_HOURS } from "@/lib/session-const";

const PUBLIC_PATHS = ["/login", "/lupa-password", "/auth/callback", "/manifest.webmanifest", "/sw.js", "/icons", "/offline.html"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user) {
    const loginAt = Number(request.cookies.get(LOGIN_AT_COOKIE)?.value ?? 0);
    const expired = !loginAt || Date.now() - loginAt > SESSION_HOURS * 3600_000;
    if (expired && !isPublic) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?pesan=Sesi+berakhir%2C+silakan+login+kembali";
      const res = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => res.cookies.set(c));
      res.cookies.delete(LOGIN_AT_COOKIE);
      return res;
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)"],
};
