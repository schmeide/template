import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().default(""),
  phone: varchar("phone", { length: 50 }).notNull().default(""),
  address: varchar("address", { length: 1000 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const newCustomerSchema = createInsertSchema(customers, {
  name: (schema) => schema.trim().min(1),
}).pick({ name: true, email: true, phone: true, address: true });

export const customerUpdateSchema = newCustomerSchema.extend(
  createSelectSchema(customers).pick({ id: true }).shape
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = z.input<typeof newCustomerSchema>;
export type CustomerUpdate = z.input<typeof customerUpdateSchema>;
