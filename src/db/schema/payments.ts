import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";
import { orders } from "./orders";
import { users } from "./auth";
import { cashDrawerShifts } from "./operations";

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "card",
  "transfer",
  "other",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: paymentMethod().notNull(),
    amountMinor: integer().notNull(),
    tipMinor: integer().notNull().default(0),
    takenByUserId: uuid()
      .notNull()
      .references(() => users.id),
    shiftId: uuid().references(() => cashDrawerShifts.id, { onDelete: "set null" }),
    paidAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    refundedAt: timestamp({ withTimezone: true }),
    refundReason: text(),
  },
  (t) => [
    index("payments_tenant_paid_idx").on(t.tenantId, t.paidAt),
    index("payments_order_idx").on(t.orderId),
  ],
);
