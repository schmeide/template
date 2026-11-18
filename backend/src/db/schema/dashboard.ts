import { date, index, integer, pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// The sample dataset the dashboard ships with: one row per sale. A project points the metrics at
// its own shapes' tables instead and drops this one (see docs/shapes/dashboard.md).
export const dashboardSales = pgTable(
  "dashboard_sales",
  {
    id: serial("id").primaryKey(),
    // A calendar day, not an instant.
    soldOn: date("sold_on").notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    // Minor units (cents).
    amount: integer("amount").notNull(),
  },
  (table) => [index().on(table.soldOn), index().on(table.category, table.soldOn)]
);

// Both days are included. No category means every category.
export const rangeSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    category: createSelectSchema(dashboardSales).shape.category.optional(),
  })
  .refine(({ from, to }) => from <= to, { message: "The range ends before it starts" });

export const exportSchema = rangeSchema.safeExtend({ table: z.enum(["series", "breakdown"]) });

export type Sale = typeof dashboardSales.$inferInsert;
export type Range = z.input<typeof rangeSchema>;
