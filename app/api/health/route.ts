import { NextResponse } from "next/server";
import { getOrm } from "@/lib/db/orm";

// Never prerendered: this endpoint exists to report live database connectivity.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orm = await getOrm();
    await orm.em.getConnection().execute("select 1");
    return NextResponse.json({ status: "ok", database: "up" });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        status: "error",
        database: "down",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
