import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "cancelled",
]);

export const billingProvider = pgEnum("billing_provider", ["manual", "stripe"]);

export const plans = pgTable(
  "plans",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(), // "starter" | "pro" | "business"
    name: text().notNull(),
    maxUserAccounts: integer().notNull(), // 0 = unlimited
    maxLocations: integer().notNull().default(1),
    priceMinor: integer().notNull(),
    currency: text().notNull().default("USD"),
    features: jsonb().$type<Record<string, boolean | number | string>>().notNull().default({}),
    active: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plans_code_uq").on(t.code)],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  planId: uuid()
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatus().notNull().default("trialing"),
  provider: billingProvider().notNull().default("manual"),
  providerRef: text(),
  currentPeriodStart: timestamp({ withTimezone: true }),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
