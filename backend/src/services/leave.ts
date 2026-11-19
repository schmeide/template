import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { approvalRequests } from "../db/schema/approval.ts";
import { ledgerAccounts, ledgerEntries, type Entry } from "../db/schema/ledger.ts";
import {
  leaveAccounts,
  leavePostings,
  type LeaveAccount,
  type SetLeaveAccount,
} from "../db/schema/leave.ts";
import { people } from "../db/schema/people.ts";
import { addEntry } from "./ledger.ts";

// The answers a leave request is read by: the request type's field labels.
const labels = { kind: "Kind of leave", firstDay: "First day", days: "Days" } as const;

type Problem = { readonly problem: string };

export const listLeaveAccounts = (db: Db, personId: number): Promise<LeaveAccount[]> =>
  db
    .select()
    .from(leaveAccounts)
    .where(eq(leaveAccounts.personId, personId))
    .orderBy(asc(leaveAccounts.kind));

// Points a person's kind of leave at a balance, or with no account, at none. A balance serves one
// person's kind; a second is refused in words.
// ponytail: two people pointing different kinds at one balance at the same moment get a unique
// violation (a 500) instead of the message; lock the account row first if that ever happens.
export const setLeaveAccount = async (
  db: Db,
  { personId, kind, accountId }: Readonly<SetLeaveAccount>
): Promise<LeaveAccount | null | Problem> => {
  if (accountId === null) {
    await db
      .delete(leaveAccounts)
      .where(and(eq(leaveAccounts.personId, personId), eq(leaveAccounts.kind, kind)));
    return null;
  }
  const [taken] = await db
    .select({ personId: leaveAccounts.personId, kind: leaveAccounts.kind, name: people.name })
    .from(leaveAccounts)
    .innerJoin(people, eq(people.id, leaveAccounts.personId))
    .where(eq(leaveAccounts.accountId, accountId));
  if (taken && (taken.personId !== personId || taken.kind !== kind)) {
    return {
      problem: `That balance is already ${taken.name}’s ${taken.kind} leave. Choose another.`,
    };
  }
  const [row] = await db
    .insert(leaveAccounts)
    .values({ personId, kind, accountId })
    .onConflictDoUpdate({
      target: [leaveAccounts.personId, leaveAccounts.kind],
      set: { accountId },
    })
    .returning();
  return row;
};

// The entry a request came off its balance with, or null when it has not.
export const getPosting = async (db: Db, requestId: number) => {
  const [row] = await db
    .select({
      entryId: ledgerEntries.id,
      accountId: ledgerAccounts.id,
      accountName: ledgerAccounts.name,
      quantity: ledgerEntries.quantity,
      entryDate: ledgerEntries.entryDate,
    })
    .from(leavePostings)
    .innerJoin(ledgerEntries, eq(ledgerEntries.id, leavePostings.entryId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(eq(leavePostings.requestId, requestId));
  return row ?? null;
};

// Whose leave a balance holds, and the requests taken off it, newest first.
export const listForAccount = async (db: Db, accountId: number) => {
  const [drawnBy, postings] = await Promise.all([
    db
      .select({ personName: people.name, kind: leaveAccounts.kind })
      .from(leaveAccounts)
      .innerJoin(people, eq(people.id, leaveAccounts.personId))
      .where(eq(leaveAccounts.accountId, accountId)),
    db
      .select({
        requestId: leavePostings.requestId,
        entryId: ledgerEntries.id,
        quantity: ledgerEntries.quantity,
        entryDate: ledgerEntries.entryDate,
      })
      .from(leavePostings)
      .innerJoin(ledgerEntries, eq(ledgerEntries.id, leavePostings.entryId))
      .where(eq(ledgerEntries.accountId, accountId))
      .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.id)),
  ]);
  return { drawnBy, postings };
};

// Takes an approved leave request's days off the balance its submitter's kind of leave draws on,
// as an `out` entry dated its first day, through the stock service so its lock and floor hold.
// The request row is locked first, so a second post of it waits and finds the first; unique
// request_id backs that up. Undefined when there is no such request.
export const postLeave = (
  db: Db,
  requestId: number
): Promise<{ entry: Entry } | Problem | undefined> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .select({ request: approvalRequests, submitter: people.name })
      .from(approvalRequests)
      .leftJoin(people, eq(people.id, approvalRequests.submitterId))
      .where(eq(approvalRequests.id, requestId))
      .for("update", { of: approvalRequests });
    if (!row) return undefined;
    const { request, submitter } = row;
    const [posted] = await tx
      .select()
      .from(leavePostings)
      .where(eq(leavePostings.requestId, requestId));
    if (posted) return { problem: "This request has already come off a balance." };
    if (request.status !== "approved") {
      return { problem: "Only an approved request comes off a balance." };
    }
    const kind = request.answers[labels.kind];
    const firstDay = request.answers[labels.firstDay];
    const days = request.answers[labels.days];
    if (request.submitterId === null) {
      return { problem: "A request sent through the public link names no one to take leave from." };
    }
    if (typeof kind !== "string" || typeof firstDay !== "string") {
      return {
        problem: "Only a request with a Kind of leave and a First day comes off a balance.",
      };
    }
    if (typeof days !== "number" || !Number.isInteger(days) || days <= 0) {
      return { problem: "Days must be a whole number above zero to come off a balance." };
    }
    const [account] = await tx
      .select({ accountId: leaveAccounts.accountId })
      .from(leaveAccounts)
      .where(and(eq(leaveAccounts.personId, request.submitterId), eq(leaveAccounts.kind, kind)));
    if (!account) {
      return {
        problem: `${submitter ?? ""}’s ${kind} leave draws on no balance. Choose one, then try again.`,
      };
    }
    const entry = await addEntry(tx, {
      accountId: account.accountId,
      kind: "out",
      quantity: -days,
      entryDate: firstDay,
      who: submitter ?? "",
      note: `${kind} leave`,
      reference: `Request #${requestId}`,
    });
    if (entry === "below floor") {
      return {
        problem:
          "That would take the balance below its floor. Allow it below zero, then try again.",
      };
    }
    // Accounts are never deleted, so the row the mapping names is there.
    if (typeof entry !== "object") return undefined;
    await tx.insert(leavePostings).values({ requestId, entryId: entry.id });
    return { entry };
  });
