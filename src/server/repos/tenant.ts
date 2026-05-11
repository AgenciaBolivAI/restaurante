import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants, memberships } from "@/db/schema";

export type TenantContext = {
  tenant: {
    id: string;
    slug: string;
    name: string;
    locale: string;
    currency: string;
    timezone: string;
    status: "trial" | "active" | "suspended" | "cancelled";
    trialEndsAt: Date | null;
  };
  membership: {
    role: "owner" | "manager" | "waiter" | "kitchen" | "bar" | "cashier";
    userId: string;
  };
};

export async function loadTenantForUser(
  slug: string,
  userId: string,
): Promise<TenantContext | null> {
  const [row] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      locale: tenants.locale,
      currency: tenants.currency,
      timezone: tenants.timezone,
      status: tenants.status,
      trialEndsAt: tenants.trialEndsAt,
      role: memberships.role,
    })
    .from(tenants)
    .innerJoin(
      memberships,
      and(eq(memberships.tenantId, tenants.id), eq(memberships.userId, userId)),
    )
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!row) return null;
  return {
    tenant: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      locale: row.locale,
      currency: row.currency,
      timezone: row.timezone,
      status: row.status,
      trialEndsAt: row.trialEndsAt,
    },
    membership: { role: row.role, userId },
  };
}
