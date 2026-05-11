"use server";

import { z } from "zod";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  tenants,
  subscriptions,
  plans,
  memberships,
  users,
  auditLog,
} from "@/db/schema";
import type { ActionState } from "@/server/services/types";

async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  if (!session.user.isPlatformAdmin) throw new Error("FORBIDDEN");
  return { userId: session.user.id };
}

export type PlatformTenant = {
  id: string;
  slug: string;
  name: string;
  status: "trial" | "active" | "suspended" | "cancelled";
  currency: string;
  locale: string;
  createdAt: string;
  trialEndsAt: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  activeMembers: number;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
};

export async function listAllTenants(query?: string): Promise<PlatformTenant[]> {
  await requirePlatformAdmin();

  const q = query?.trim().toLowerCase();

  const where = q
    ? or(
        like(sql`LOWER(${tenants.name})`, `%${q}%`),
        like(sql`LOWER(${tenants.slug})`, `%${q}%`),
      )
    : undefined;

  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      currency: tenants.currency,
      locale: tenants.locale,
      createdAt: tenants.createdAt,
      trialEndsAt: tenants.trialEndsAt,
    })
    .from(tenants)
    .where(where)
    .orderBy(desc(tenants.createdAt));

  if (rows.length === 0) return [];

  // Owner email per tenant (first owner)
  const tenantIds = rows.map((r) => r.id);
  const owners = await db
    .select({
      tenantId: memberships.tenantId,
      userId: users.id,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        inArray(memberships.tenantId, tenantIds),
        eq(memberships.role, "owner"),
        eq(memberships.active, true),
      ),
    )
    .orderBy(asc(memberships.createdAt));
  const ownerMap = new Map<string, { userId: string; email: string }>();
  for (const o of owners) {
    if (!ownerMap.has(o.tenantId)) {
      ownerMap.set(o.tenantId, { userId: o.userId, email: o.email });
    }
  }

  // Active member count per tenant
  const memberCounts = await db
    .select({
      tenantId: memberships.tenantId,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(memberships)
    .where(
      and(
        inArray(memberships.tenantId, tenantIds),
        eq(memberships.active, true),
      ),
    )
    .groupBy(memberships.tenantId);
  const memberMap = new Map(memberCounts.map((m) => [m.tenantId, m.n]));

  // Most recent subscription per tenant
  const subs = await db
    .select({
      tenantId: subscriptions.tenantId,
      planCode: plans.code,
      planName: plans.name,
      status: subscriptions.status,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(inArray(subscriptions.tenantId, tenantIds))
    .orderBy(desc(subscriptions.createdAt));
  const subMap = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    if (!subMap.has(s.tenantId)) subMap.set(s.tenantId, s);
  }

  return rows.map((r) => {
    const sub = subMap.get(r.id);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      status: r.status,
      currency: r.currency,
      locale: r.locale,
      createdAt: r.createdAt.toISOString(),
      trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
      ownerUserId: ownerMap.get(r.id)?.userId ?? null,
      ownerEmail: ownerMap.get(r.id)?.email ?? null,
      activeMembers: memberMap.get(r.id) ?? 0,
      planCode: sub?.planCode ?? null,
      planName: sub?.planName ?? null,
      subscriptionStatus: sub?.status ?? null,
    };
  });
}

export async function listAllPlans() {
  await requirePlatformAdmin();
  return db
    .select()
    .from(plans)
    .orderBy(asc(plans.priceMinor));
}

const setStatusSchema = z.object({
  tenantId: z.string().uuid(),
  status: z.enum(["trial", "active", "suspended", "cancelled"]),
});

export async function setTenantStatusAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();

  const parsed = setStatusSchema.safeParse({
    tenantId: formData.get("tenantId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  await db.transaction(async (tx) => {
    const [t] = await tx
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, parsed.data.tenantId))
      .limit(1);
    if (!t) return;

    await tx
      .update(tenants)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(tenants.id, parsed.data.tenantId));

    // Sync subscription status when going active/suspended
    const subStatus =
      parsed.data.status === "active"
        ? "active"
        : parsed.data.status === "suspended"
          ? "suspended"
          : parsed.data.status === "cancelled"
            ? "cancelled"
            : "trialing";

    await tx
      .update(subscriptions)
      .set({ status: subStatus, updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, parsed.data.tenantId));

    await tx.insert(auditLog).values({
      tenantId: parsed.data.tenantId,
      actorUserId: admin.userId,
      action: "platform.set_status",
      entity: "tenant",
      entityId: parsed.data.tenantId,
      before: { status: t.status },
      after: { status: parsed.data.status },
    });
  });

  revalidatePath(`/[locale]/platform`, "page");
  return { status: "ok" };
}

const extendTrialSchema = z.object({
  tenantId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365),
});

export async function extendTrialAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();

  const parsed = extendTrialSchema.safeParse({
    tenantId: formData.get("tenantId"),
    days: formData.get("days"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  const [t] = await db
    .select({ trialEndsAt: tenants.trialEndsAt })
    .from(tenants)
    .where(eq(tenants.id, parsed.data.tenantId))
    .limit(1);
  if (!t) return { status: "error", message: "Tenant not found" };

  const base = t.trialEndsAt && t.trialEndsAt > new Date() ? t.trialEndsAt : new Date();
  const next = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);

  await db
    .update(tenants)
    .set({ trialEndsAt: next, status: "trial", updatedAt: new Date() })
    .where(eq(tenants.id, parsed.data.tenantId));

  await db.insert(auditLog).values({
    tenantId: parsed.data.tenantId,
    actorUserId: admin.userId,
    action: "platform.extend_trial",
    entity: "tenant",
    entityId: parsed.data.tenantId,
    before: { trialEndsAt: t.trialEndsAt?.toISOString() ?? null },
    after: { trialEndsAt: next.toISOString() },
  });

  revalidatePath(`/[locale]/platform`, "page");
  return { status: "ok" };
}

const changePlanSchema = z.object({
  tenantId: z.string().uuid(),
  planCode: z.string().min(1).max(40),
});

export async function changePlanAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePlatformAdmin();

  const parsed = changePlanSchema.safeParse({
    tenantId: formData.get("tenantId"),
    planCode: formData.get("planCode"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.code, parsed.data.planCode))
    .limit(1);
  if (!plan) return { status: "error", message: "Plan not found" };

  await db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, parsed.data.tenantId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (sub) {
      await tx
        .update(subscriptions)
        .set({ planId: plan.id, updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));
    } else {
      await tx.insert(subscriptions).values({
        tenantId: parsed.data.tenantId,
        planId: plan.id,
        status: "active",
        provider: "manual",
      });
    }

    await tx.insert(auditLog).values({
      tenantId: parsed.data.tenantId,
      actorUserId: admin.userId,
      action: "platform.change_plan",
      entity: "subscription",
      entityId: sub?.id ?? null,
      before: { planId: sub?.planId ?? null },
      after: { planId: plan.id, planCode: plan.code },
    });
  });

  revalidatePath(`/[locale]/platform`, "page");
  return { status: "ok" };
}

export async function isPlatformAdmin(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.isPlatformAdmin;
}
