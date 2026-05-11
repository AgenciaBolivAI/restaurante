import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants, locations } from "./tenancy";
import { users } from "./auth";

export const tableStatus = pgEnum("table_status", [
  "free",
  "occupied",
  "bill",
  "cleaning",
]);

export const tables = pgTable(
  "tables",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    seats: integer().notNull().default(2),
    area: text(),
    status: tableStatus().notNull().default("free"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tables_tenant_location_number_uq").on(
      t.tenantId,
      t.locationId,
      t.number,
    ),
  ],
);

export const timeClockEntries = pgTable(
  "time_clock_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clockIn: timestamp({ withTimezone: true }).notNull(),
    clockOut: timestamp({ withTimezone: true }),
    notes: text(),
  },
  (t) => [index("time_clock_tenant_user_idx").on(t.tenantId, t.userId)],
);

export const cashDrawerShifts = pgTable(
  "cash_drawer_shifts",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    openedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    openingFloatMinor: integer().notNull().default(0),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedByUserId: uuid().references(() => users.id),
    closingCountMinor: integer(),
    expectedMinor: integer(),
    varianceMinor: integer(),
    closedAt: timestamp({ withTimezone: true }),
    notes: text(),
  },
  (t) => [index("shifts_tenant_idx").on(t.tenantId, t.openedAt)],
);
