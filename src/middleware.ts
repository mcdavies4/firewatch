import { NextResponse, type NextRequest } from "next/server";

/**
 * Basic-auth gate for the admin dashboard. Good enough for a pilot with one
 * union office; swap for Supabase Auth when you have multiple markets/users.
 * Public routes (/ack, /cert, /api/*) are excluded via the matcher below.
 */
export function middleware(req: NextRequest) {
  const user = process.env.DASHBOARD_USER ?? "admin";
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) {
    return new NextResponse("Set DASHBOARD_PASSWORD to use the dashboard.", { status: 503 });
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [u, p] = atob(header.slice(6)).split(":");
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Firewatch"' },
  });
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/alerts/:path*", "/setup/:path*", "/shops/:path*"],
};
