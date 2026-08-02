import { NextRequest } from "next/server";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is configured
 * (see vercel.json + Vercel's cron docs). Reject anything else so these endpoints can't be
 * used to trigger notification sends or bulk status changes from the public internet. */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured: only acceptable in local development.
    return process.env.NODE_ENV !== "production";
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
