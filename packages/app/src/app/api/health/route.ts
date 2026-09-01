import { NextResponse } from "next/server";
import { checkDbConnection, getEnv } from "@devmentor/core";

// Never prerender — this route probes the live database connection.
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe. Reports app status plus database reachability. Returns
 * 200 even when the DB is down (body reports `database: "down"`) so the app itself is
 * considered live; flip to 503 here if you want readiness to fail on DB loss.
 */
export async function GET() {
  const env = getEnv();
  const db = await checkDbConnection();

  return NextResponse.json({
    status: "ok",
    app: env.APP_NAME,
    environment: env.NODE_ENV,
    database: db.ok ? "up" : "down",
    ...(db.ok ? {} : { databaseError: db.reason }),
  });
}
