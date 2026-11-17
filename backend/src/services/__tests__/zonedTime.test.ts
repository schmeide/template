import { describe, expect, it } from "vitest";
import { addDays, instantOf, localDate, weekdayOf } from "../zonedTime.ts";

// New York springs forward on 2030-03-10 (02:00 becomes 03:00) and falls back on 2030-11-03
// (02:00 becomes 01:00).
const ny = "America/New_York";

describe("zoned time", () => {
  it("turns wall-clock time into an instant with that day's offset", () => {
    expect(instantOf("2030-01-15", "09:00", ny).toISOString()).toBe("2030-01-15T14:00:00.000Z");
    expect(instantOf("2030-07-15", "09:00", ny).toISOString()).toBe("2030-07-15T13:00:00.000Z");
    expect(instantOf("2030-07-15", "09:00", "Asia/Kolkata").toISOString()).toBe(
      "2030-07-15T03:30:00.000Z"
    );
    expect(instantOf("2030-07-15", "09:00:00", "UTC").toISOString()).toBe(
      "2030-07-15T09:00:00.000Z"
    );
  });

  it("moves a time in the skipped hour on by the gap", () => {
    expect(instantOf("2030-03-10", "01:30", ny).toISOString()).toBe("2030-03-10T06:30:00.000Z");
    expect(instantOf("2030-03-10", "02:30", ny).toISOString()).toBe("2030-03-10T07:30:00.000Z");
    expect(instantOf("2030-03-10", "03:30", ny).toISOString()).toBe("2030-03-10T07:30:00.000Z");
  });

  it("takes the earlier instant in the repeated hour", () => {
    expect(instantOf("2030-11-03", "01:30", ny).toISOString()).toBe("2030-11-03T05:30:00.000Z");
    expect(instantOf("2030-11-03", "02:30", ny).toISOString()).toBe("2030-11-03T07:30:00.000Z");
  });

  it("reads the local day of an instant", () => {
    expect(localDate(new Date("2030-11-04T03:00:00Z"), ny)).toBe("2030-11-03");
    expect(localDate(new Date("2030-11-04T03:00:00Z"), "UTC")).toBe("2030-11-04");
  });

  it("counts days and weekdays on the calendar", () => {
    expect(addDays("2030-03-09", 1)).toBe("2030-03-10");
    expect(addDays("2030-12-31", 1)).toBe("2031-01-01");
    expect(weekdayOf("2030-03-10")).toBe(0);
  });
});
