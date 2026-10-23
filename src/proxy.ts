import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
const PUBLIC_PATHS = ["/login", "/api/auth", "/_next", "/foco-"];
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next();
  const cookie = request.cookies.get("better-auth.session_token") ?? request.cookies.get("__Secure-better-auth.session_token");
  if (!cookie) { const url = new URL("/login", request.url); url.searchParams.set("redirect", pathname); return NextResponse.redirect(url); }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)).*)"] };