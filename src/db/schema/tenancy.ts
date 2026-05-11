import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", [
  "trial",
  "active",
  "suspended",
  "cancelled",
]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    name: text().notNull(),
    timezone: text().notNull().default("UTC"),
    currency: text().notNull().default("USD"),
    locale: text().notNull().default("es"),
    status: tenantStatus().notNull().default("trial"),
    trialEndsAt: timestamp({ withTimezone: true }),
    stripeCustomerId: text(),
    address: text(),
    receiptFooter: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenants_slug_uq").on(t.slug)],
);

export const locations = pgTable("locations", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text().notNull(),
  address: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
