import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { takePublicSlot } from "../rateLimit.ts";

describe("takePublicSlot", () => {
  it("limits submissions per key in a time window", () => {
    const key = randomUUID();
    const start = 1_000_000;

    const taken = Array.from({ length: 6 }, () => takePublicSlot(key, start));

    expect(taken).toEqual([true, true, true, true, true, false]);
    expect(takePublicSlot(randomUUID(), start)).toBe(true);
    expect(takePublicSlot(key, start + 60 * 60 * 1000)).toBe(true);
  });
});
