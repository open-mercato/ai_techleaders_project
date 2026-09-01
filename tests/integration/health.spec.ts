import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { closeTestOrm, countMessages, resetMessages, seedMessages } from "./db";

// No browser here on purpose: if this file fails, the problem is the container,
// the migrations or the app boot — not agent-browser.
describe("app + database wiring", () => {
  const baseUrl = inject("baseUrl");
  const databaseUrl = inject("databaseUrl");

  beforeEach(async () => {
    await resetMessages(databaseUrl);
  });

  afterAll(async () => {
    await closeTestOrm();
  });

  it("reports the database as reachable", async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "ok",
      database: "up",
    });
  });

  it("applied the migration, so the messages table is usable", async () => {
    await expect(countMessages(databaseUrl)).resolves.toBe(0);

    await seedMessages(databaseUrl, ["from the test harness"]);

    await expect(countMessages(databaseUrl)).resolves.toBe(1);
  });

  it("serves seeded rows through the page", async () => {
    await seedMessages(databaseUrl, ["server rendered row"]);

    const res = await fetch(`${baseUrl}/messages`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("server rendered row");
  });
});
