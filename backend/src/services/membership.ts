import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { customers } from "../db/schema/customers.ts";
import {
  membershipLevels,
  membershipPeriods,
  type AddPeriod,
  type Level,
  type LevelUpdate,
  type MemberStatus,
  type NewLevel,
  type Period,
} from "../db/schema/membership.ts";

// A member whose latest period ends within this many days is due.
const dueDays = 30;

// Today as the server's UTC date, as for overdue invoices.
export const currentDate = (): string => new Date().toISOString().slice(0, 10);

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// The last day of a period of `months` from `startsOn`: 2030-03-15 for 12 months ends 2031-03-14.
// ponytail: a start past the 28th rolls over a short month (Jan 31 + 1 month ends Mar 2); clamp
// to the month's end if monthly levels need it.
const endFor = (startsOn: string, months: number): string => {
  const start = new Date(`${startsOn}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() + months);
  return addDays(start.toISOString().slice(0, 10), -1);
};

// Status is never stored: it comes from the latest period's end and today.
export const statusOf = (endsOn: string | null, today: string): MemberStatus => {
  if (endsOn === null) return "current";
  if (endsOn < today) return "lapsed";
  return endsOn <= addDays(today, dueDays) ? "due" : "current";
};

export const listLevels = (db: Db): Promise<readonly Level[]> =>
  db.select().from(membershipLevels).orderBy(asc(membershipLevels.name), asc(membershipLevels.id));

export const createLevel = async (db: Db, input: Readonly<NewLevel>): Promise<Level> => {
  const [level] = await db.insert(membershipLevels).values(input).returning();
  return level;
};

// Changes only the level: periods keep the name and fee they were added with.
export const updateLevel = async (
  db: Db,
  { id, ...fields }: Readonly<LevelUpdate>
): Promise<Level | undefined> => {
  const [level] = await db
    .update(membershipLevels)
    .set(fields)
    .where(eq(membershipLevels.id, id))
    .returning();
  return level;
};

export const retireLevel = async (db: Db, id: number): Promise<Level | undefined> => {
  const [level] = await db
    .update(membershipLevels)
    .set({ retired: true })
    .where(eq(membershipLevels.id, id))
    .returning();
  return level;
};

// Why a period was not added: no such customer or live level, the latest period is not the one
// staff saw (someone added one meanwhile), or the member is a member for life.
export type Refusal = "not found" | "changed" | "life member";

// Joins or renews: the next period starts today for a new or lapsed member, and the day after the
// latest one ends for a current one, so a member's periods never overlap. The customer's row is
// locked while the latest period is checked and the new one inserted, so of two clicks on "Renew"
// the second finds a newer period than it saw and adds nothing.
export const addPeriod = (
  db: Db,
  { customerId, levelId, latestPeriodId }: Readonly<AddPeriod>,
  today = currentDate()
): Promise<Period | Refusal> =>
  db.transaction(async (tx) => {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .for("update");
    const [level] = await tx
      .select()
      .from(membershipLevels)
      .where(and(eq(membershipLevels.id, levelId), eq(membershipLevels.retired, false)));
    if (!customer || !level) return "not found";
    const [latest] = await tx
      .select()
      .from(membershipPeriods)
      .where(eq(membershipPeriods.customerId, customerId))
      .orderBy(desc(membershipPeriods.startsOn))
      .limit(1);
    if ((latest?.id ?? null) !== latestPeriodId) return "changed";
    if (latest && latest.endsOn === null) return "life member";
    const startsOn = latest?.endsOn && latest.endsOn >= today ? addDays(latest.endsOn, 1) : today;
    const [period] = await tx
      .insert(membershipPeriods)
      .values({
        customerId,
        levelId,
        levelName: level.name,
        fee: level.fee,
        startsOn,
        endsOn: level.months === null ? null : endFor(startsOn, level.months),
      })
      .returning();
    return period;
  });

// Every customer with a period, with their latest period's level and end, and their status. The
// page filters by status itself.
// ponytail: returns every member at once, fine for a club's few thousand; page it past that.
export const listMembers = async (db: Db, today = currentDate()) => {
  const rows = await db
    .selectDistinctOn([membershipPeriods.customerId], {
      customerId: membershipPeriods.customerId,
      name: customers.name,
      email: customers.email,
      levelName: membershipPeriods.levelName,
      latestPeriodId: membershipPeriods.id,
      endsOn: membershipPeriods.endsOn,
    })
    .from(membershipPeriods)
    .innerJoin(customers, eq(membershipPeriods.customerId, customers.id))
    .orderBy(membershipPeriods.customerId, desc(membershipPeriods.startsOn));
  return rows
    .map((row) => ({ ...row, status: statusOf(row.endsOn, today) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.customerId - b.customerId);
};

// A member with their periods, latest first, or undefined for a customer with none.
export const getMember = async (db: Db, customerId: number, today = currentDate()) => {
  const rows = await db
    .select({ customer: customers, period: membershipPeriods })
    .from(membershipPeriods)
    .innerJoin(customers, eq(membershipPeriods.customerId, customers.id))
    .where(eq(membershipPeriods.customerId, customerId))
    .orderBy(desc(membershipPeriods.startsOn));
  if (rows.length === 0) return undefined;
  const periods = rows.map(({ period }) => period);
  return {
    customer: rows[0].customer,
    status: statusOf(periods[0].endsOn, today),
    periods,
  };
};
