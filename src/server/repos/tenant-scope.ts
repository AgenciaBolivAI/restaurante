import { and, eq } from "drizzle-orm";
import { effectiveAuth } from "@/server/auth/impersonation";
import { db } from "@/db/client";
import { tenants, memberships, locations } from "@/db/schema";

export type Role = "owner" | "manager" | "waiter" | "kitchen" | "bar" | "cashier";

export type TenantScope = {
  userId: string; // effective user (impersonated when applicable)
  realUserId: string; // who's actually authenticated
  impersonating: boolean;
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  role: Role;
};

/**
 * Resolves the current user's scope for a given tenant slug.
 * Throws if the session is missing or the user has no membership.
 * This is the single chokepoint that all tenant-scoped server actions and queries must go through.
 */
export async function requireTenantScope(slug: string): Promise<TenantScope> {
  const session = await effectiveAuth();
  if (!session) throw new Error("UNAUTHENTICATED");

  const [row] = await db
    .select({
      tenantId: tenants.id,
      tenantSlug: tenants.slug,
      role: memberships.role,
      locationId: locations.id,
    })
    .from(tenants)
    .innerJoin(
      memberships,
      and(
        eq(memberships.tenantId, tenants.id),
        eq(memberships.userId, session.user.id),
      ),
    )
    .innerJoin(locations, eq(locations.tenantId, tenants.id))
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!row) throw new Error("FORBIDDEN");

  return {
    userId: session.user.id,
    realUserId: session.realUserId,
    impersonating: session.impersonating,
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    locationId: row.locationId,
    role: row.role,
  };
}

const ROLE_RANK: Record<Role, number> = {
  owner: 5,
  manager: 4,
  cashier: 3,
  waiter: 2,
  kitchen: 1,
  bar: 1,
};

export function requireRole(scope: TenantScope, minRole: Role): void {
  if (ROLE_RANK[scope.role] < ROLE_RANK[minRole]) {
    throw new Error("FORBIDDEN");
  }
}
