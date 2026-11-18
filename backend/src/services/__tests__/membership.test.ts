import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { membershipPeriods } from "../../db/schema/membership.ts";
import { createCustomer } from "../customers.ts";
import {
  addPeriod,
  createLevel,
  getMember,
  listLevels,
  listMembers,
  retireLevel,
  updateLevel,
} from "../membership.ts";

// Tests share one database, so each makes its own customers and levels and asserts only on those.
const db = createDb(process.env.DATABASE_URL ?? "");
afterAll(() => db.$client.end());

const newLevel = (months: number | null = 12, fee = 5000) =>
  createLevel(db, { name: randomUUID(), fee, months });
const newCustomer = () => createCustomer(db, { name: randomUUID() });

// Joins, then renews from the latest period each time, on the days given.
const joinAndRenew = async (customerId: number, levelId: number, days: readonly string[]) => {
  let latestPeriodId: number | null = null;
  for (const today of days) {
    const period = await addPeriod(db, { customerId, levelId, latestPeriodId }, today);
    if (typeof period === "string") throw new Error(period);
    latestPeriodId = period.id;
  }
  return latestPeriodId;
};

describe("membership service", () => {
  it("keeps levels, edits them and retires them", async () => {
    const level = await newLevel();

    const updated = await updateLevel(db, {
      id: level.id,
      name: level.name,
      fee: 6000,
      months: 12,
    });
    const retired = await retireLevel(db, level.id);

    expect(updated).toMatchObject({ fee: 6000, retired: false });
    expect(retired).toMatchObject({ retired: true });
    expect((await listLevels(db)).find(({ id }) => id === level.id)).toMatchObject({
      retired: true,
    });
    expect(await updateLevel(db, { id: -1, name: "x", fee: 0, months: null })).toBeUndefined();
    expect(await retireLevel(db, -1)).toBeUndefined();
  });

  it("joins a member today, for the level's months or for life, copying its name and fee", async () => {
    const [year, life] = [await newLevel(12, 5000), await newLevel(null, 0)];
    const [ada, bea] = [await newCustomer(), await newCustomer()];

    const joined = await addPeriod(
      db,
      { customerId: ada.id, levelId: year.id, latestPeriodId: null },
      "2030-03-15"
    );
    const forLife = await addPeriod(
      db,
      { customerId: bea.id, levelId: life.id, latestPeriodId: null },
      "2030-03-15"
    );
    await updateLevel(db, { id: year.id, name: "Renamed", fee: 9900, months: 12 });

    expect(joined).toMatchObject({
      levelName: year.name,
      fee: 5000,
      startsOn: "2030-03-15",
      endsOn: "2031-03-14",
    });
    expect(forLife).toMatchObject({ startsOn: "2030-03-15", endsOn: null, fee: 0 });
    expect((await getMember(db, ada.id, "2030-03-15"))?.periods).toMatchObject([
      { levelName: year.name, fee: 5000 },
    ]);
  });

  it("renews a current member from the day after their period, a lapsed one from today", async () => {
    const level = await newLevel();
    const [current, lastDay, lapsed] = [
      await newCustomer(),
      await newCustomer(),
      await newCustomer(),
    ];

    await joinAndRenew(current.id, level.id, ["2030-01-01", "2030-06-01"]);
    // Renewed on the last day of the period, so the next one starts the day after.
    await joinAndRenew(lastDay.id, level.id, ["2030-01-01", "2030-12-31"]);
    await joinAndRenew(lapsed.id, level.id, ["2030-01-01", "2031-02-10"]);

    const periods = async (customerId: number) =>
      (await getMember(db, customerId, "2031-03-01"))?.periods.map(({ startsOn, endsOn }) => [
        startsOn,
        endsOn,
      ]);
    // Latest first.
    expect(await periods(current.id)).toEqual([
      ["2031-01-01", "2031-12-31"],
      ["2030-01-01", "2030-12-31"],
    ]);
    expect(await periods(lastDay.id)).toEqual([
      ["2031-01-01", "2031-12-31"],
      ["2030-01-01", "2030-12-31"],
    ]);
    expect(await periods(lapsed.id)).toEqual([
      ["2031-02-10", "2032-02-09"],
      ["2030-01-01", "2030-12-31"],
    ]);
  });

  it("adds one period when two people renew at once", async () => {
    const level = await newLevel();
    const member = await newCustomer();
    const latestPeriodId = await joinAndRenew(member.id, level.id, ["2030-01-01"]);

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        addPeriod(db, { customerId: member.id, levelId: level.id, latestPeriodId }, "2030-12-01")
      )
    );

    expect(results.filter((result) => typeof result !== "string")).toHaveLength(1);
    expect(results.filter((result) => result === "changed")).toHaveLength(3);
    expect((await getMember(db, member.id, "2030-12-01"))?.periods).toHaveLength(2);
  });

  it("refuses a stale renewal, a renewal of a life member and a retired or missing level", async () => {
    const [year, life] = [await newLevel(), await newLevel(null)];
    const [member, lifer] = [await newCustomer(), await newCustomer()];
    await joinAndRenew(member.id, year.id, ["2030-01-01"]);
    const lifePeriod = await joinAndRenew(lifer.id, life.id, ["2030-01-01"]);
    const retired = await newLevel();
    await retireLevel(db, retired.id);
    const join = (levelId: number, customerId = member.id) =>
      addPeriod(db, { customerId, levelId, latestPeriodId: null }, "2030-06-01");

    expect(await join(year.id)).toBe("changed");
    expect(
      await addPeriod(
        db,
        { customerId: lifer.id, levelId: year.id, latestPeriodId: lifePeriod },
        "2030-06-01"
      )
    ).toBe("life member");
    expect(await join(retired.id, (await newCustomer()).id)).toBe("not found");
    expect(await join(-1, (await newCustomer()).id)).toBe("not found");
    expect(await join(year.id, -1)).toBe("not found");
  });

  it("has the database keep a period's end after its start", async () => {
    const level = await newLevel();
    const member = await newCustomer();
    const period = {
      customerId: member.id,
      levelId: level.id,
      levelName: level.name,
      fee: 0,
      startsOn: "2030-01-01",
    };

    await expect(
      db.insert(membershipPeriods).values({ ...period, endsOn: "2030-01-01" })
    ).rejects.toThrow();
    await expect(
      db.insert(membershipPeriods).values({ ...period, endsOn: "2029-12-31" })
    ).rejects.toThrow();
  });

  it("lists members as current, due or lapsed, from today's date, and leaves out non-members", async () => {
    const [year, life] = [await newLevel(), await newLevel(null)];
    const [current, due, lapsed, lifer, renewedEarly, guest] = await Promise.all(
      Array.from({ length: 6 }, () => newCustomer())
    );
    const today = "2030-12-10";
    await joinAndRenew(current.id, year.id, ["2030-03-01"]);
    // Ends 2030-12-31, within 30 days.
    await joinAndRenew(due.id, year.id, ["2030-01-01"]);
    await joinAndRenew(lapsed.id, year.id, ["2029-01-01"]);
    await joinAndRenew(lifer.id, life.id, ["2020-01-01"]);
    await joinAndRenew(renewedEarly.id, year.id, ["2030-01-01", "2030-12-01"]);

    const ours = new Set([current, due, lapsed, lifer, renewedEarly, guest].map(({ id }) => id));
    const members = (await listMembers(db, today))
      .filter(({ customerId }) => ours.has(customerId))
      .map(({ name, status, endsOn }) => [name, status, endsOn]);

    expect(members).toHaveLength(5);
    expect(members).toEqual(
      expect.arrayContaining([
        [current.name, "current", "2031-02-28"],
        [due.name, "due", "2030-12-31"],
        [lapsed.name, "lapsed", "2029-12-31"],
        [lifer.name, "current", null],
        [renewedEarly.name, "current", "2031-12-31"],
      ])
    );
    expect(await getMember(db, guest.id, today)).toBeUndefined();
    expect(await getMember(db, due.id, today)).toMatchObject({ status: "due" });
  });
});
