import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
].join("; ");

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export async function middleware(request: NextRequest) {
  // No global request-rate check here: @upstash/redis isn't Edge-runtime compatible (Next
  // middleware always runs on the Edge), and per §8.4 the doc explicitly treats volumetric
  // abuse as the CDN/edge's job at this scale, not application code. Route handlers still
  // apply their own narrower, Upstash-backed limits (§8.4 table) — see src/lib/rate-limit.ts.
  let response = NextResponse.next({ request });

  // Refresh the Supabase session cookie on every request, per @supabase/ssr's documented
  // Next.js middleware pattern — without this, sessions silently expire mid-visit.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    await supabase.auth.getUser();
  }

  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, so security headers and session refresh
     * apply everywhere without doing extra work on _next/static, images, etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
