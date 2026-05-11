import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants, locations } from "./tenancy";

export const station = pgEnum("station", ["kitchen", "bar", "both", "none"]);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text().notNull(),
    bps: integer().notNull(), // basis points: 1000 = 10%
    inclusive: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tax_rates_tenant_idx").on(t.tenantId)],
);

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menu_categories_tenant_idx").on(t.tenantId)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid().references(() => menuCategories.id, { onDelete: "set null" }),
    name: text().notNull(),
    description: text(),
    priceMinor: integer().notNull(),
    taxRateId: uuid().references(() => taxRates.id, { onDelete: "set null" }),
    station: station().notNull().default("kitchen"),
    sortOrder: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menu_items_tenant_cat_idx").on(t.tenantId, t.categoryId)],
);

export const modifierGroups = pgTable(
  "modifier_groups",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text().notNull(),
    minSelect: integer().notNull().default(0),
    maxSelect: integer().notNull().default(1),
    required: boolean().notNull().default(false),
  },
  (t) => [index("modifier_groups_tenant_idx").on(t.tenantId)],
);

export const modifiers = pgTable("modifiers", {
  id: uuid().primaryKey().defaultRandom(),
  groupId: uuid()
    .notNull()
    .references(() => modifierGroups.id, { onDelete: "cascade" }),
  name: text().notNull(),
  priceDeltaMinor: integer().notNull().default(0),
  sortOrder: integer().notNull().default(0),
});

export const menuItemModifierGroups = pgTable("menu_item_modifier_groups", {
  menuItemId: uuid()
    .notNull()
    .references(() => menuItems.id, { onDelete: "cascade" }),
  groupId: uuid()
    .notNull()
    .references(() => modifierGroups.id, { onDelete: "cascade" }),
});

// Re-export for relations
export { locations };
