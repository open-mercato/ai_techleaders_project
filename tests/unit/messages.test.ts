import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, validateMessageBody } from "@/lib/messages";

describe("validateMessageBody", () => {
  it("accepts a normal message", () => {
    expect(validateMessageBody("hello world")).toEqual({
      ok: true,
      value: "hello world",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(validateMessageBody("  padded  ")).toEqual({
      ok: true,
      value: "padded",
    });
  });

  it("rejects an empty string", () => {
    expect(validateMessageBody("")).toEqual({
      ok: false,
      error: "Message cannot be empty.",
    });
  });

  it("rejects whitespace-only input", () => {
    expect(validateMessageBody("   \n\t ")).toEqual({
      ok: false,
      error: "Message cannot be empty.",
    });
  });

  it("rejects non-string input", () => {
    // FormData.get() returns null for a missing field and File for an upload.
    expect(validateMessageBody(null)).toEqual({
      ok: false,
      error: "Message must be text.",
    });
    expect(validateMessageBody(42)).toEqual({
      ok: false,
      error: "Message must be text.",
    });
  });

  it("accepts input exactly at the length limit", () => {
    const body = "a".repeat(MAX_MESSAGE_LENGTH);
    expect(validateMessageBody(body)).toEqual({ ok: true, value: body });
  });

  it("rejects input one character over the limit", () => {
    const result = validateMessageBody("a".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("measures length after trimming, not before", () => {
    const body = `  ${"a".repeat(MAX_MESSAGE_LENGTH)}  `;
    expect(validateMessageBody(body).ok).toBe(true);
  });
});
