import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { tenants, locations } from "./tenancy";
import { users } from "./auth";
import { tables } from "./operations";
import { menuItems } from "./catalog";
import { station } from "./catalog";

export const orderType = pgEnum("order_type", ["dine_in", "to_go", "delivery"]);

export const orderStatus = pgEnum("order_status", [
  "open",
  "sent",
  "preparing",
  "ready",
  "served",
  "paid",
  "void",
]);

export const kdsStatus = pgEnum("kds_status", [
  "pending",
  "preparing",
  "ready",
  "served",
  "void",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    tableId: uuid().references(() => tables.id, { onDelete: "set null" }),
    orderType: orderType().notNull().default("dine_in"),
    status: orderStatus().notNull().default("open"),
    sequenceNo: integer().notNull(), // human-friendly per-day number
    openedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
    pickupAt: timestamp({ withTimezone: true }), // for to_go
    notes: text(),
    subtotalMinor: integer().notNull().default(0),
    taxMinor: integer().notNull().default(0),
    tipMinor: integer().notNull().default(0),
    totalMinor: integer().notNull().default(0),
  },
  (t) => [
    index("orders_tenant_opened_idx").on(t.tenantId, t.openedAt),
    index("orders_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: uuid()
      .notNull()
      .references(() => menuItems.id),
    nameSnapshot: text().notNull(),
    qty: integer().notNull().default(1),
    unitPriceMinor: integer().notNull(),
    taxMinor: integer().notNull().default(0),
    modifiersSnapshot: jsonb()
      .$type<Array<{ name: string; priceDeltaMinor: number }>>()
      .notNull()
      .default([]),
    notes: text(),
    station: station().notNull().default("kitchen"),
    kdsStatus: kdsStatus().notNull().default("pending"),
    addedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    firedAt: timestamp({ withTimezone: true }),
    readyAt: timestamp({ withTimezone: true }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
  },
  (t) => [index("order_items_order_kds_idx").on(t.orderId, t.kdsStatus)],
);

export const orderAssignees = pgTable(
  "order_assignees",
  {
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isPrimary: boolean().notNull().default(false),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.userId] })],
);
