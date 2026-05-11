import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";
import { users } from "./auth";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    actorImpersonatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(), // e.g. "order.void", "payment.refund", "menu_item.delete"
    entity: text().notNull(),
    entityId: text(),
    before: jsonb(),
    after: jsonb(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_at_idx").on(t.tenantId, t.at)],
);
