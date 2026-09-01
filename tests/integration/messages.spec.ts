import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";
import { AgentBrowser } from "./agent-browser";
import { closeTestOrm, countMessages, resetMessages, seedMessages } from "./db";

describe("messages page", () => {
  const baseUrl = inject("baseUrl");
  const databaseUrl = inject("databaseUrl");

  // A dedicated session keeps this file's browser state isolated from any other.
  const browser = new AgentBrowser("integration-messages", baseUrl);

  beforeAll(async () => {
    // A stale daemon from an interrupted run would otherwise serve old state.
    await browser.close();
  });

  beforeEach(async () => {
    await resetMessages(databaseUrl);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail") {
      await browser.screenshot(ctx.task.name).catch(() => {
        // A failed screenshot must not mask the original assertion failure.
      });
    }
  });

  afterAll(async () => {
    await browser.close();
    await closeTestOrm();
  });

  it("shows the empty state when there are no messages", async () => {
    await browser.open("/messages");

    expect(await browser.isVisible('[data-testid="message-empty"]')).toBe(true);
    expect(await browser.count('[data-testid="message-item"]')).toBe(0);
  });

  it("renders messages already in the database", async () => {
    await seedMessages(databaseUrl, ["persisted before load"]);

    await browser.open("/messages");

    await browser.waitForText("persisted before load");
    expect(await browser.count('[data-testid="message-item"]')).toBe(1);
  });

  it("persists a message submitted through the form", async () => {
    await browser.open("/messages");

    await browser.fill('[data-testid="message-input"]', "written by the browser");
    await browser.click('[data-testid="message-submit"]');

    // Assert on the rendered page first, then confirm it truly reached Postgres.
    await browser.waitForText("written by the browser");
    await expect(countMessages(databaseUrl)).resolves.toBe(1);
  });

  it("surfaces a validation error and writes nothing", async () => {
    await browser.open("/messages");

    // The input has no `required` attribute, so this reaches server validation.
    await browser.click('[data-testid="message-submit"]');

    await browser.waitForSelector('[data-testid="message-error"]');
    expect(await browser.text('[data-testid="message-error"]')).toContain(
      "Message cannot be empty.",
    );
    await expect(countMessages(databaseUrl)).resolves.toBe(0);
  });
});
