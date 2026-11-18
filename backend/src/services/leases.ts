import { and, asc, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { customers } from "../db/schema/customers.ts";
import {
  leases,
  type Lease,
  type LeaseFilter,
  type LeaseUpdate,
  type NewLease,
} from "../db/schema/leases.ts";
import { registryRecords } from "../db/schema/registry.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// What a change to a lease can be refused for.
export type Refusal =
  | "no lease"
  | "no unit"
  | "unit archived"
  | "no tenant"
  | "cancelled"
  | "started"
  | "ends later"
  | "before first day";

// The lease a change would overlap.
export type Clash = { readonly clash: Lease };

export type LeaseState = "current" | "upcoming" | "ended" | "cancelled";

// A missing last day runs on forever.
const lastDayOrForever = (lastDay: SQL | string | null | undefined) =>
  sql`coalesce(${lastDay ?? null}::date, 'infinity'::date)`;

// Locks the unit's row, so changes to its leases' dates queue. Call inside a transaction.
const lockUnit = async (tx: Tx, recordId: number) => {
  const [unit] = await tx
    .select({ archivedAt: registryRecords.archivedAt })
    .from(registryRecords)
    .where(eq(registryRecords.id, recordId))
    .for("update");
  return unit;
};

// A live lease of the unit, other than `except`, that shares a day with `firstDay` to `lastDay`.
const findClash = async (
  tx: Tx,
  recordId: number,
  { firstDay, lastDay }: { readonly firstDay: string; readonly lastDay?: string | null },
  except?: number
): Promise<Lease | undefined> => {
  const [clash] = await tx
    .select()
    .from(leases)
    .where(
      and(
        eq(leases.recordId, recordId),
        isNull(leases.cancelledAt),
        except === undefined ? undefined : ne(leases.id, except),
        sql`${leases.firstDay} <= ${lastDayOrForever(lastDay)}`,
        sql`${lastDayOrForever(sql`${leases.lastDay}`)} >= ${firstDay}::date`
      )
    )
    .orderBy(asc(leases.firstDay))
    .limit(1);
  return clash;
};

// Locks a lease's row and reads it.
const lockLease = async (tx: Tx, id: number) => {
  const [lease] = await tx.select().from(leases).where(eq(leases.id, id)).for("update");
  return lease;
};

export const createLease = (db: Db, input: Readonly<NewLease>): Promise<Lease | Refusal | Clash> =>
  db.transaction(async (tx) => {
    const unit = await lockUnit(tx, input.recordId);
    if (!unit) return "no unit";
    if (unit.archivedAt) return "unit archived";
    const clash = await findClash(tx, input.recordId, input);
    if (clash) return { clash };
    const [tenant] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, input.customerId));
    if (!tenant) return "no tenant";
    const [lease] = await tx.insert(leases).values(input).returning();
    return lease;
  });

// Changes everything but the unit. The unit's lock is taken before the lease's, as in
// `createLease`, so two changes never wait on each other.
export const updateLease = (
  db: Db,
  { id, ...fields }: Readonly<LeaseUpdate>
): Promise<Lease | Refusal | Clash> =>
  db.transaction(async (tx) => {
    const [found] = await tx.select().from(leases).where(eq(leases.id, id));
    if (!found) return "no lease";
    await lockUnit(tx, found.recordId);
    const current = await lockLease(tx, id);
    if (current.cancelledAt) return "cancelled";
    const clash = await findClash(tx, found.recordId, fields, id);
    if (clash) return { clash };
    const [tenant] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, fields.customerId));
    if (!tenant) return "no tenant";
    const [lease] = await tx
      .update(leases)
      .set({ ...fields, lastDay: fields.lastDay ?? null })
      .where(eq(leases.id, id))
      .returning();
    return lease;
  });

// Sets the last day, or moves it earlier, never before the first day. An earlier end cannot
// clash, but it takes the unit's lock like every other change to a lease's dates.
export const endLease = (
  db: Db,
  { id, lastDay }: { readonly id: number; readonly lastDay: string }
): Promise<Lease | Refusal> =>
  db.transaction(async (tx) => {
    const [found] = await tx.select().from(leases).where(eq(leases.id, id));
    if (!found) return "no lease";
    await lockUnit(tx, found.recordId);
    const current = await lockLease(tx, id);
    if (current.cancelledAt) return "cancelled";
    if (lastDay < current.firstDay) return "before first day";
    if (current.lastDay !== null && lastDay > current.lastDay) return "ends later";
    const [lease] = await tx.update(leases).set({ lastDay }).where(eq(leases.id, id)).returning();
    return lease;
  });

// Only a lease that has not started on the viewer's day can be cancelled; one that has is ended.
export const cancelLease = (
  db: Db,
  { id, today }: { readonly id: number; readonly today: string }
): Promise<Lease | Refusal> =>
  db.transaction(async (tx) => {
    const current = await lockLease(tx, id);
    if (!current) return "no lease";
    if (current.cancelledAt) return "cancelled";
    if (current.firstDay <= today) return "started";
    const [lease] = await tx
      .update(leases)
      .set({ cancelledAt: new Date() })
      .where(eq(leases.id, id))
      .returning();
    return lease;
  });

export const leaseState = (lease: Readonly<Lease>, today: string): LeaseState => {
  if (lease.cancelledAt) return "cancelled";
  if (lease.firstDay > today) return "upcoming";
  if (lease.lastDay !== null && lease.lastDay < today) return "ended";
  return "current";
};

const unitColumns = {
  id: registryRecords.id,
  name: registryRecords.name,
  tag: registryRecords.tag,
  archivedAt: registryRecords.archivedAt,
};

export const getLease = async (db: Db, id: number) => {
  const [row] = await db
    .select({
      lease: leases,
      unit: unitColumns,
      tenant: { id: customers.id, name: customers.name },
    })
    .from(leases)
    .innerJoin(registryRecords, eq(leases.recordId, registryRecords.id))
    .innerJoin(customers, eq(leases.customerId, customers.id))
    .where(eq(leases.id, id));
  if (!row) return undefined;
  return { ...row.lease, unit: row.unit, tenant: row.tenant };
};

// Every lease, latest first day first, with its state on the viewer's day.
// ponytail: no paging; add it when a portfolio reaches thousands of leases.
export const listLeases = async (
  db: Db,
  { today, recordId, customerId }: Readonly<LeaseFilter>
) => {
  const rows = await db
    .select({ lease: leases, unitName: registryRecords.name, tenantName: customers.name })
    .from(leases)
    .innerJoin(registryRecords, eq(leases.recordId, registryRecords.id))
    .innerJoin(customers, eq(leases.customerId, customers.id))
    .where(
      and(
        recordId === undefined ? undefined : eq(leases.recordId, recordId),
        customerId === undefined ? undefined : eq(leases.customerId, customerId)
      )
    )
    .orderBy(desc(leases.firstDay), desc(leases.id));
  return rows.map(({ lease, unitName, tenantName }) => ({
    ...lease,
    unitName,
    tenantName,
    state: leaseState(lease, today),
  }));
};

// Every unit that is not archived, by name, vacant when no lease is current on the viewer's day.
// ponytail: no paging, as the unit picker needs them all; search instead past a few thousand.
export const listUnits = async (db: Db, today: string) => {
  const current = db
    .select({ id: leases.id })
    .from(leases)
    .where(
      and(
        eq(leases.recordId, registryRecords.id),
        isNull(leases.cancelledAt),
        sql`${leases.firstDay} <= ${today}::date`,
        sql`${lastDayOrForever(sql`${leases.lastDay}`)} >= ${today}::date`
      )
    );
  return db
    .select({
      id: registryRecords.id,
      name: registryRecords.name,
      tag: registryRecords.tag,
      vacant: sql<boolean>`not exists (${current})`,
    })
    .from(registryRecords)
    .where(isNull(registryRecords.archivedAt))
    .orderBy(asc(registryRecords.name), asc(registryRecords.id));
};
